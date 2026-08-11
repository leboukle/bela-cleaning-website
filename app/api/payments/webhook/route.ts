// SERVER-ONLY API route. Receives Stripe webhook events — the approved,
// authoritative source for payment results (see paymentWebhookService.ts).
// The Vercel Protection Bypass secret for this endpoint is applied as a
// query parameter on the URL registered in the Stripe Dashboard (Stripe
// cannot set custom headers on webhook delivery), never as a header;
// see docs/payments.md for the exact configured URL. Signature
// verification below is the real authentication for this route — the
// bypass secret only gets the request past Vercel's Preview Deployment
// Protection, it proves nothing about who sent it.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/booking/server/stripe/stripeConfig";
import { handlePaymentIntentFailed, handlePaymentIntentSucceeded } from "@/lib/booking/server/paymentWebhookService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, code: "invalid-signature", message: "Missing Stripe-Signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (error) {
    console.error("[api/payments/webhook] signature verification failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, code: "invalid-signature", message: "Signature verification failed." }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, repository, notificationService);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, repository, notificationService);
    }
    // Every other event type is acknowledged and ignored — this endpoint
    // only needs the two handled above per the approved scope, and Stripe
    // expects a 200 for event types it wasn't asked to process.
  } catch (error) {
    console.error(`[api/payments/webhook] handler failed: type=${event.type}`, error instanceof Error ? error.message : "unknown error");
    // 500 tells Stripe to retry delivery — appropriate for a transient
    // failure (e.g. a Sheets API hiccup), and safe to retry since both
    // handlers are idempotent.
    return NextResponse.json({ ok: false, code: "server-error", message: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
