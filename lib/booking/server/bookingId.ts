// SERVER-ONLY. Generates a unique, human-readable BeLa booking ID.
// Format: BELA-YYYYMMDD-XXXXXX, where YYYYMMDD is the submission date
// (UTC) and XXXXXX is 6 random characters from a 32-symbol alphabet with
// visually ambiguous characters (0/O, 1/I) removed for readability when
// read aloud or typed back by a customer.
//
// Pure generation only — no Sheets I/O here. Collision checking (reading
// existing Booking IDs and regenerating on the rare match) lives in
// bookingService.ts, which has access to the repository.
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

/**
 * 32^6 (~1.07 billion) possible suffixes per day makes a same-day
 * collision vanishingly unlikely; bookingService still checks and
 * regenerates on the rare match as defense in depth.
 */
export function generateBookingId(now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `BELA-${datePart}-${randomSuffix()}`;
}
