import { describe, it, expect } from "vitest";
import {
  createKeepStandardAcknowledgement,
  normalizeNotes,
  notesMentionDeepCleaning,
  shouldShowDeepCleaningNotice,
} from "./notesSafeguard";

describe("notesMentionDeepCleaning", () => {
  it.each([
    "floors need deep cleaning",
    "Please DEEP CLEAN the bathrooms",
    "kitchen needs a deep-clean",
    "The oven should be deep cleaned",
    "Deep Cleaning please",
    "deep clean.",
    "(deep-cleaning)",
    "deep   clean",
    "deep\nclean",
    "deep‑clean", // non-breaking hyphen
    "deep–clean", // en dash
  ])("detects %j", (notes) => {
    expect(notesMentionDeepCleaning(notes)).toBe(true);
  });

  it.each([
    "Please pay extra attention to the kitchen",
    "the dog is friendly, use the side door",
    "deep breath, it's a small place",
    "please bring a cleaner with a good vacuum",
    "a deep cleanse of the fridge", // "cleanse" is not "clean"
    "deeply cleaning is not needed",
    "Deep, Cleaning?", // a comma between the words is not the phrase
    "",
  ])("does not flag ordinary notes: %j", (notes) => {
    expect(notesMentionDeepCleaning(notes)).toBe(false);
  });
});

describe("shouldShowDeepCleaningNotice", () => {
  const trigger = "Please DEEP CLEAN the bathrooms";

  it("warns for Standard Cleaning + a trigger phrase", () => {
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: "floors need deep cleaning", acknowledgement: null })).toBe(true);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: trigger, acknowledgement: null })).toBe(true);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: "kitchen needs a deep-clean", acknowledgement: null })).toBe(true);
  });

  it("does not warn for ordinary Standard notes", () => {
    expect(
      shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: "Please pay extra attention to the kitchen", acknowledgement: null }),
    ).toBe(false);
  });

  it("does not warn when Deep Cleaning is already selected, even with deep-clean notes", () => {
    expect(shouldShowDeepCleaningNotice({ cleaningType: "deep", notes: "deep clean the floors", acknowledgement: null })).toBe(false);
  });

  it("only guards Standard — move-in / move-out / unselected never trigger it", () => {
    for (const cleaningType of ["move-in", "move-out", null] as const) {
      expect(shouldShowDeepCleaningNotice({ cleaningType, notes: trigger, acknowledgement: null })).toBe(false);
    }
  });

  it("stops warning once the customer explicitly kept Standard for this exact state", () => {
    const acknowledgement = createKeepStandardAcknowledgement("standard", trigger);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: trigger, acknowledgement })).toBe(false);
  });

  it("treats whitespace-only edits as the same notes (acknowledgement still valid)", () => {
    const acknowledgement = createKeepStandardAcknowledgement("standard", trigger);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: `  ${trigger}   `, acknowledgement })).toBe(false);
    expect(normalizeNotes("  a \n  b  ")).toBe("a b");
  });

  it("re-evaluates (warns again) when the notes materially change after an acknowledgement", () => {
    const acknowledgement = createKeepStandardAcknowledgement("standard", trigger);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: `${trigger} and the oven`, acknowledgement })).toBe(true);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: "deep clean the windows too", acknowledgement })).toBe(true);
  });

  it("does not warn if the changed notes no longer contain a trigger phrase", () => {
    const acknowledgement = createKeepStandardAcknowledgement("standard", trigger);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: "just the usual, thanks", acknowledgement })).toBe(false);
  });

  it("never treats an acknowledgement recorded for a different cleaning type as valid", () => {
    const acknowledgement = createKeepStandardAcknowledgement("deep", trigger);
    expect(shouldShowDeepCleaningNotice({ cleaningType: "standard", notes: trigger, acknowledgement })).toBe(true);
  });

  it("does not mutate or rewrite the customer's notes", () => {
    const notes = "  Please DEEP CLEAN   the bathrooms  ";
    createKeepStandardAcknowledgement("standard", notes);
    shouldShowDeepCleaningNotice({ cleaningType: "standard", notes, acknowledgement: null });
    expect(notes).toBe("  Please DEEP CLEAN   the bathrooms  ");
  });
});
