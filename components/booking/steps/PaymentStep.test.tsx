// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}));

// Captures whatever the component last passed as onReady/onLoadError so
// tests can fire them manually — standing in for Stripe's real iframe
// lifecycle events, which jsdom can't produce.
let paymentElementOnReady: (() => void) | undefined;
let paymentElementOnLoadError: ((event: { error: { message?: string } }) => void) | undefined;

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <>{children}</>,
  PaymentElement: (props: {
    onReady?: () => void;
    onLoadError?: (event: { error: { message?: string } }) => void;
  }) => {
    paymentElementOnReady = props.onReady;
    paymentElementOnLoadError = props.onLoadError;
    return <div data-testid="payment-element" />;
  },
  useStripe: vi.fn(),
  useElements: vi.fn(),
}));

import { useStripe, useElements } from "@stripe/react-stripe-js";
import PaymentStep from "./PaymentStep";

const mockedUseStripe = vi.mocked(useStripe);
const mockedUseElements = vi.mocked(useElements);

function fakeElements(overrides: Partial<{ submit: () => Promise<{ error?: { message?: string } }> }> = {}) {
  return {
    submit: vi.fn().mockResolvedValue({ error: undefined }),
    ...overrides,
  };
}

function fakeStripe(overrides: Partial<{ confirmSetup: (...args: unknown[]) => Promise<unknown> }> = {}) {
  return {
    confirmSetup: vi.fn(),
    ...overrides,
  };
}

const BASE_PROPS = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "5551234567",
  totalPrice: 190.5,
  onBack: vi.fn(),
};

function jsonResponse(body: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
}

/** Renders PaymentStep and waits for the SetupIntent fetch to resolve to "ready", with Stripe/Elements ready to be driven manually. */
async function renderReady(onSetupComplete = vi.fn()) {
  mockedUseStripe.mockReturnValue(fakeStripe() as never);
  mockedUseElements.mockReturnValue(fakeElements() as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse({ ok: true, clientSecret: "seti_123_secret_abc", setupIntentId: "seti_123" })),
  );
  render(<PaymentStep {...BASE_PROPS} onSetupComplete={onSetupComplete} />);
  await waitFor(() => expect(screen.getByTestId("payment-element")).toBeTruthy());
  return { onSetupComplete };
}

function markElementReady() {
  act(() => {
    paymentElementOnReady?.();
  });
}

function consentAndGetButton() {
  fireEvent.click(screen.getByRole("checkbox"));
  return screen.getByRole("button", { name: /save payment method|saving/i });
}

beforeEach(() => {
  paymentElementOnReady = undefined;
  paymentElementOnLoadError = undefined;
  mockedUseStripe.mockReset();
  mockedUseElements.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PaymentStep — setup-intent fetch states", () => {
  it("shows the initial loading state before the setup-intent fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={vi.fn()} />);
    expect(screen.getByText(/setting up secure payment/i)).toBeTruthy();
  });

  it("shows an error state when the setup-intent request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/couldn't reach the server/i)).toBeTruthy());
  });

  it("shows the server's error message when the setup-intent response is ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ ok: false, message: "A valid name, email, and phone number are required." })));
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/valid name, email, and phone number are required/i)).toBeTruthy());
  });
});

describe("PaymentStep — PaymentElement readiness gating", () => {
  it("shows 'Loading payment fields…' and keeps the confirm button disabled until onReady fires", async () => {
    await renderReady();
    expect(screen.getByText(/loading payment fields/i)).toBeTruthy();
    const button = consentAndGetButton();
    expect(button).toHaveProperty("disabled", true);
  });

  it("enables the confirm button and clears the loading indicator once onReady fires and consent is checked", async () => {
    await renderReady();
    markElementReady();
    expect(screen.queryByText(/loading payment fields/i)).toBeNull();
    const button = consentAndGetButton();
    expect(button).toHaveProperty("disabled", false);
  });

  it("shows a visible error and keeps the button permanently disabled when onLoadError fires", async () => {
    await renderReady();
    act(() => {
      paymentElementOnLoadError?.({ error: { message: "Payment form failed to load." } });
    });
    expect(screen.getByText(/payment form failed to load/i)).toBeTruthy();
    const button = consentAndGetButton();
    expect(button).toHaveProperty("disabled", true);
  });

  it("never allows confirmation before onReady, even with stripe/elements already present", async () => {
    const { onSetupComplete } = await renderReady();
    const button = consentAndGetButton();
    fireEvent.click(button);
    expect(onSetupComplete).not.toHaveBeenCalled();
  });
});

describe("PaymentStep — confirmation flow", () => {
  it("calls elements.submit() first and surfaces its validation error without calling stripe.confirmSetup()", async () => {
    const submit = vi.fn().mockResolvedValue({ error: { message: "Your card number is incomplete." } });
    const confirmSetup = vi.fn();
    mockedUseElements.mockReturnValue(fakeElements({ submit }) as never);
    mockedUseStripe.mockReturnValue(fakeStripe({ confirmSetup }) as never);
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ ok: true, clientSecret: "seti_secret", setupIntentId: "seti_123" })));
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeTruthy());
    markElementReady();

    const button = consentAndGetButton();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/card number is incomplete/i)).toBeTruthy());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(confirmSetup).not.toHaveBeenCalled();
    expect(button).toHaveProperty("disabled", false); // submitting reset, re-enabled
  });

  it("calls stripe.confirmSetup() after a clean submit and completes on success", async () => {
    const confirmSetup = vi.fn().mockResolvedValue({ error: undefined, setupIntent: { id: "seti_123", status: "succeeded" } });
    mockedUseElements.mockReturnValue(fakeElements() as never);
    mockedUseStripe.mockReturnValue(fakeStripe({ confirmSetup }) as never);
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ ok: true, clientSecret: "seti_secret", setupIntentId: "seti_123" })));
    const onSetupComplete = vi.fn();
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={onSetupComplete} />);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeTruthy());
    markElementReady();

    fireEvent.click(consentAndGetButton());

    await waitFor(() => expect(onSetupComplete).toHaveBeenCalledWith("seti_123"));
    expect(confirmSetup).toHaveBeenCalledTimes(1);
  });

  it("surfaces confirmSetup's returned error and re-enables the button", async () => {
    const confirmSetup = vi.fn().mockResolvedValue({ error: { message: "Your card was declined." } });
    mockedUseElements.mockReturnValue(fakeElements() as never);
    mockedUseStripe.mockReturnValue(fakeStripe({ confirmSetup }) as never);
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ ok: true, clientSecret: "seti_secret", setupIntentId: "seti_123" })));
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeTruthy());
    markElementReady();

    const button = consentAndGetButton();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/card was declined/i)).toBeTruthy());
    expect(button).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: /save payment method/i })).toBeTruthy();
  });

  it("times out a hung confirmSetup() call and shows a retryable error instead of spinning forever", async () => {
    vi.useFakeTimers();
    const confirmSetup = vi.fn(() => new Promise(() => {})); // never resolves
    mockedUseElements.mockReturnValue(fakeElements() as never);
    mockedUseStripe.mockReturnValue(fakeStripe({ confirmSetup }) as never);
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ ok: true, clientSecret: "seti_secret", setupIntentId: "seti_123" })));
    render(<PaymentStep {...BASE_PROPS} onSetupComplete={vi.fn()} />);
    await vi.waitFor(() => expect(screen.getByTestId("payment-element")).toBeTruthy());
    markElementReady();

    fireEvent.click(consentAndGetButton());
    expect(screen.getByRole("button", { name: /saving/i })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    await vi.waitFor(() => expect(screen.getByText(/taking longer than expected/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /save payment method/i })).toHaveProperty("disabled", false);
  });
});
