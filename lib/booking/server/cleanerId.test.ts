import { describe, it, expect } from "vitest";
import { generateCleanerId, generateAssignmentId } from "./cleanerId";

describe("generateCleanerId", () => {
  it('matches the "CLNR-XXXXXX" format with no ambiguous characters (0/O/1/I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCleanerId()).toMatch(/^CLNR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("generates distinct IDs across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCleanerId()));
    expect(ids.size).toBe(50);
  });
});

describe("generateAssignmentId", () => {
  it('matches the "ASGN-XXXXXX" format', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateAssignmentId()).toMatch(/^ASGN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("never collides with generateCleanerId's format", () => {
    expect(generateAssignmentId()).not.toMatch(/^CLNR-/);
  });
});
