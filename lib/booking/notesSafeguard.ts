// Deterministic (phrase-based, no AI) Standard-vs-Deep scope safeguard for
// the free-text "special instructions" notes. Pure and client-safe: the
// booking flow uses it to decide whether to interrupt final submission with
// the "your notes may require a Deep Cleaning" notice. It never edits or
// rewrites the customer's notes and never touches pricing — switching to
// Deep Cleaning is just a cleaningType change that the existing centralized
// pricing/duration engine (calculate.ts) prices as usual.
import type { CleaningTypeId } from "./types";

// "deep clean", "deep cleaning", "deep cleaned", "deep-clean" (plus plural
// "deep cleans"), case-insensitive. The separator tolerates any run of
// whitespace, ASCII hyphens, and the Unicode dash/hyphen range U+2010–U+2015
// so "Deep‑Clean" (non-breaking hyphen) and "deep   cleaning" match.
// The trailing \b keeps unrelated words such as "cleaner" or "cleanse" from
// matching.
const DEEP_CLEAN_PATTERN = /\bdeep[\s\-‐-―]*clean(?:ing|ed|s)?\b/i;

export function notesMentionDeepCleaning(notes: string): boolean {
  return DEEP_CLEAN_PATTERN.test(notes);
}

/** Trims and collapses whitespace so cosmetic edits alone don't count as changing the notes. */
export function normalizeNotes(notes: string): string {
  return notes.trim().replace(/\s+/g, " ");
}

/**
 * Recorded when the customer explicitly chooses "Keep Standard Cleaning".
 * It captures the exact service + notes state that was acknowledged, so the
 * acknowledgement can never go stale: any later change to either makes it
 * stop matching and the safeguard re-evaluates from scratch.
 */
export type KeepStandardAcknowledgement = {
  cleaningType: CleaningTypeId;
  notes: string;
};

export function createKeepStandardAcknowledgement(
  cleaningType: CleaningTypeId,
  notes: string,
): KeepStandardAcknowledgement {
  return { cleaningType, notes: normalizeNotes(notes) };
}

export type DeepCleaningNoticeInput = {
  cleaningType: CleaningTypeId | null;
  notes: string;
  acknowledgement: KeepStandardAcknowledgement | null;
};

/**
 * True only when the customer chose Standard Cleaning, the notes mention
 * deep-cleaning work, and they have NOT already explicitly chosen to keep
 * Standard for this exact service + notes state. Deep Cleaning (and every
 * other cleaning type) never triggers the notice.
 */
export function shouldShowDeepCleaningNotice({ cleaningType, notes, acknowledgement }: DeepCleaningNoticeInput): boolean {
  if (cleaningType !== "standard") return false;
  if (!notesMentionDeepCleaning(notes)) return false;

  const alreadyAcknowledged =
    acknowledgement !== null &&
    acknowledgement.cleaningType === cleaningType &&
    acknowledgement.notes === normalizeNotes(notes);
  return !alreadyAcknowledged;
}
