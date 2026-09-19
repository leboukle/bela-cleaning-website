"use client";

import { useCallback, useState } from "react";
import {
  createKeepStandardAcknowledgement,
  shouldShowDeepCleaningNotice,
  type KeepStandardAcknowledgement,
} from "@/lib/booking/notesSafeguard";
import type { CleaningTypeId } from "@/lib/booking/types";

type UseDeepCleaningNoticeArgs = {
  cleaningType: CleaningTypeId | null;
  notes: string;
  /** Proceeds with the real booking submission. */
  onSubmit: () => void;
  /** Applies the Standard -> Deep Cleaning switch to the booking state. */
  onSwitchToDeep: () => void;
};

/**
 * Gates final booking submission behind the Standard-vs-Deep notes
 * safeguard (see lib/booking/notesSafeguard.ts for the pure rules).
 *
 * Acknowledgement semantics:
 * - Only an explicit "Keep Standard Cleaning" is recorded. `dismiss()`
 *   (X / Escape / backdrop) just closes the dialog — it records nothing and
 *   submits nothing, so the next submit attempt asks again.
 * - The acknowledgement snapshots the exact cleaning type + notes it was
 *   given for; if either later differs, it no longer matches and the
 *   safeguard re-evaluates. Callers must also call
 *   `resetAcknowledgement()` whenever the cleaning type actually changes,
 *   so a Standard -> Deep -> Standard round trip doesn't reuse a stale
 *   acknowledgement.
 */
export function useDeepCleaningNotice({ cleaningType, notes, onSubmit, onSwitchToDeep }: UseDeepCleaningNoticeArgs) {
  const [acknowledgement, setAcknowledgement] = useState<KeepStandardAcknowledgement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const requestSubmit = useCallback(() => {
    if (shouldShowDeepCleaningNotice({ cleaningType, notes, acknowledgement })) {
      setIsOpen(true);
      return;
    }
    onSubmit();
  }, [cleaningType, notes, acknowledgement, onSubmit]);

  const keepStandard = useCallback(() => {
    if (cleaningType) setAcknowledgement(createKeepStandardAcknowledgement(cleaningType, notes));
    setIsOpen(false);
    onSubmit();
  }, [cleaningType, notes, onSubmit]);

  const switchToDeep = useCallback(() => {
    setAcknowledgement(null);
    setIsOpen(false);
    onSwitchToDeep();
  }, [onSwitchToDeep]);

  const dismiss = useCallback(() => setIsOpen(false), []);
  const resetAcknowledgement = useCallback(() => setAcknowledgement(null), []);

  return { isOpen, requestSubmit, keepStandard, switchToDeep, dismiss, resetAcknowledgement };
}
