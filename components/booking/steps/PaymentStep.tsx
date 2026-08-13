"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/booking/calculate";
import StepShell from "@/components/booking/StepShell";

// Loaded once per page load, not per step-mount — loadStripe() memoizes
// the Stripe.js script load itself, but this avoids even re-calling it on
// every visit to this step (e.g. Back then Continue again).
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe(): Promise<StripeJs | null> {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = publishableKey ? loadStripe(publishableKey) : Promise.resolve(null);
  }
  return stripePromise;
}

type PaymentStepProps = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  totalPrice: number | null;
  onSetupComplete: (setupIntentId: string) => void;
  onBack: () => void;
};

type SetupState =
  | { status: "loading" }
  | { status: "ready"; clientSecret: string }
  | { status: "error"; message: string };

// Outer component: creates the Stripe Customer + SetupIntent server-side
// (no card data touches this request) and, once it has a client_secret,
// mounts Stripe Elements around the actual form. Re-fetches a fresh
// SetupIntent every time this step is (re-)entered rather than trying to
// reuse a stale clientSecret across visits — simpler and avoids any
// question of whether a previously-fetched SetupIntent is still valid.
export default function PaymentStep({ firstName, lastName, email, phone, totalPrice, onSetupComplete, onBack }: PaymentStepProps) {
  const [setup, setSetup] = useState<SetupState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let response: Response;
      try {
        response = await fetch("/api/payments/setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, email, phone }),
        });
      } catch {
        if (!cancelled) setSetup({ status: "error", message: "We couldn't reach the server. Please check your connection and try again." });
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = await response.json();
      } catch {
        if (!cancelled) setSetup({ status: "error", message: "Something went wrong setting up payment. Please try again." });
        return;
      }

      if (cancelled) return;
      if (body.ok === true && typeof body.clientSecret === "string") {
        setSetup({ status: "ready", clientSecret: body.clientSecret });
      } else {
        const message = typeof body.message === "string" ? body.message : "We couldn't set up payment. Please try again.";
        setSetup({ status: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally re-fetches only when this step is freshly mounted, not
    // on every keystroke elsewhere in the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (setup.status === "loading") {
    return (
      <StepShell question="Payment method" onBack={onBack}>
        <div className="flex items-center gap-3 text-[#8A7A6B]">
          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          <span className="text-sm">Setting up secure payment…</span>
        </div>
      </StepShell>
    );
  }

  if (setup.status === "error") {
    return (
      <StepShell question="Payment method" onBack={onBack}>
        <div className="flex items-start gap-3 rounded-2xl border border-[#C97B63] bg-[#FBEAE4] p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#B14A2E]" aria-hidden="true" />
          <p className="text-sm font-medium text-[#3B2F27]">{setup.message}</p>
        </div>
      </StepShell>
    );
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{ clientSecret: setup.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#3B2F27" } } }}
    >
      <PaymentForm totalPrice={totalPrice} onSetupComplete={onSetupComplete} onBack={onBack} />
    </Elements>
  );
}

type PaymentFormProps = {
  totalPrice: number | null;
  onSetupComplete: (setupIntentId: string) => void;
  onBack: () => void;
};

// Stripe.js can leave stripe.confirmSetup() unresolved indefinitely under
// some failure conditions (the PaymentElement's own internal state never
// settles) — this bounds that call so a hang always resolves into a
// visible, retryable error instead of an infinite "Saving…" state.
const CONFIRM_SETUP_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function PaymentForm({ totalPrice, onSetupComplete, onBack }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate from `stripe`/`elements` being non-null: those only mean the
  // Stripe.js SDK and Elements group exist, not that the PaymentElement's
  // own iframe has actually finished loading and can accept input. Gating
  // confirmation on this too is the fix for the Production hang — the
  // customer must never be able to submit before Stripe has confirmed the
  // fields are actually ready.
  const [elementReady, setElementReady] = useState(false);
  const [elementError, setElementError] = useState<string | null>(null);

  const returnUrl = useMemo(() => (typeof window !== "undefined" ? window.location.href : ""), []);

  const handleConfirm = async () => {
    if (!stripe || !elements || !elementReady || elementError || !consented || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      // Required before confirmSetup() with a PaymentElement — validates
      // the entered details client-side and surfaces an incomplete/invalid
      // card error immediately, rather than only discovering it (or hanging)
      // inside confirmSetup() itself.
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Please check your card details and try again.");
        setSubmitting(false);
        return;
      }

      const { error: confirmError, setupIntent } = await withTimeout(
        stripe.confirmSetup({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: "if_required",
        }),
        CONFIRM_SETUP_TIMEOUT_MS,
      );

      if (confirmError) {
        setError(confirmError.message ?? "We couldn't save your payment method. Please check your card details and try again.");
        setSubmitting(false);
        return;
      }

      if (setupIntent?.status === "succeeded") {
        onSetupComplete(setupIntent.id);
        return;
      }

      setError("We couldn't confirm your payment method. Please try again.");
      setSubmitting(false);
    } catch {
      setError("This is taking longer than expected. Please try again, or contact us if the problem continues.");
      setSubmitting(false);
    }
  };

  return (
    <StepShell
      question="Payment method"
      note="Add a card to reserve your appointment. You won't be charged today."
      onBack={onBack}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#E7DECE] bg-white p-6">
          {!elementReady && !elementError && (
            <div className="mb-4 flex items-center gap-3 text-[#8A7A6B]">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              <span className="text-sm">Loading payment fields…</span>
            </div>
          )}
          {elementError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#C97B63] bg-[#FBEAE4] p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#B14A2E]" aria-hidden="true" />
              <p className="text-sm font-medium text-[#3B2F27]">{elementError}</p>
            </div>
          )}
          <PaymentElement
            options={{ layout: "tabs" }}
            onReady={() => setElementReady(true)}
            onLoadError={(event) => {
              setElementError(event.error.message ?? "We couldn't load the payment form. Please go back and try again.");
            }}
          />
        </div>

        <div className="rounded-2xl border border-[#E7DECE] bg-[#FBF7EF] p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#8A7A6B]">How you&rsquo;ll be charged</p>
          <ul className="mt-3 space-y-2 text-sm text-[#6B5B4C]">
            <li>Your card is saved securely with Stripe — BeLa Cleaning never sees or stores your card details.</li>
            <li>You are not charged today.</li>
            <li>
              {totalPrice != null ? `The total shown (${formatCurrency(totalPrice)})` : "Your booking total"} will be
              charged automatically to this card starting 1 hour after your cleaning&rsquo;s scheduled end time.
            </li>
            <li>This automatic charge may occur even if you&rsquo;re not present or don&rsquo;t return to this site.</li>
          </ul>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E7DECE] bg-white p-5">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#C9BCA6] text-[#3B2F27] accent-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
          />
          <span className="text-sm text-[#3B2F27]">
            I agree that BeLa Cleaning will securely save this payment method and automatically charge it
            {totalPrice != null ? ` ${formatCurrency(totalPrice)} ` : " the total shown "}
            starting 1 hour after my cleaning&rsquo;s scheduled end time, without further action from me.
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#C97B63] bg-[#FBEAE4] p-5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#B14A2E]" aria-hidden="true" />
            <p className="text-sm font-medium text-[#3B2F27]">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!stripe || !elements || !elementReady || Boolean(elementError) || !consented || submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#3B2F27] px-8 py-4 text-base font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_32px_-12px_rgba(59,47,39,0.4)] active:translate-y-0 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:w-auto"
        >
          {submitting && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {submitting ? "Saving…" : "Save Payment Method & Continue"}
        </button>
      </div>
    </StepShell>
  );
}
