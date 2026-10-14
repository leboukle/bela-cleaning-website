"use client";

import { useCallback, useEffect, useState } from "react";

export type FollowUpEligibilityState =
  | { status: "none" }
  | { status: "checking" }
  | { status: "eligible" }
  | { status: "ineligible"; reason: "first-cleaning-not-completed" | "not-eligible" | "unavailable" };

/**
 * Asks the server whether the follow-up link this booking was opened with
 * qualifies for the recurring discount, so the quote on screen matches
 * what the server will price. This is a display mirror only: the server
 * re-resolves eligibility from the token on every submission, and a
 * submission whose shown total differs from the server's is refused
 * (price-changed), so nothing here can grant a discount.
 */
export function useFollowUpEligibility(token: string | null) {
  const [state, setState] = useState<FollowUpEligibilityState>(token ? { status: "checking" } : { status: "none" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch(`/api/booking/follow-up-eligibility?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok === true && body.eligible === true) {
          setState({ status: "eligible" });
        } else if (body?.ok === true) {
          setState({
            status: "ineligible",
            reason: body.reason === "first-cleaning-not-completed" ? "first-cleaning-not-completed" : "not-eligible",
          });
        } else {
          setState({ status: "ineligible", reason: "unavailable" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "ineligible", reason: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  /** Re-asks the server (e.g. after it reported the price changed). No-op without a link. */
  const refresh = useCallback(() => {
    if (!token) return;
    setState({ status: "checking" });
    setAttempt((n) => n + 1);
  }, [token]);

  return { state, refresh };
}
