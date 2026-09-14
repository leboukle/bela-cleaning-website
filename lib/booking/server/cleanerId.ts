// SERVER-ONLY. Generates unique, human-readable IDs for the Milestone 7
// cleaner-assignment domain — mirrors bookingId.ts's format/alphabet
// exactly (32-symbol alphabet, 0/O/1/I removed for readability) so both
// ID families read consistently, but with distinct prefixes so a Cleaner
// ID and an Assignment ID can never be confused with a Booking ID or with
// each other at a glance.
//
// Pure generation only — no Sheets I/O here. Collision checking lives in
// the repository/service layer, same split as bookingId.ts.
import "server-only";
import { randomBytes } from "node:crypto";

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no 0/O/1/I
const SUFFIX_LENGTH = 6;

function randomSuffix(): string {
  const bytes = randomBytes(SUFFIX_LENGTH);
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return suffix;
}

/** 32^6 (~1.07 billion) possible suffixes makes a collision vanishingly unlikely; callers still check and regenerate as defense in depth. */
export function generateCleanerId(): string {
  return `CLNR-${randomSuffix()}`;
}

/** Same collision-resistance profile as generateCleanerId — distinct prefix only. */
export function generateAssignmentId(): string {
  return `ASGN-${randomSuffix()}`;
}
