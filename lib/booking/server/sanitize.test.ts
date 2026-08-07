import { describe, it, expect } from "vitest";
import { sanitizeForSheets } from "./sanitize";

describe("sanitizeForSheets", () => {
  it("leaves normal text unchanged", () => {
    expect(sanitizeForSheets("123 Main St")).toBe("123 Main St");
  });

  it.each(["=", "+", "-", "@"])("prefixes text starting with %s with a leading apostrophe", (char) => {
    expect(sanitizeForSheets(`${char}SUM(A1:A10)`)).toBe(`'${char}SUM(A1:A10)`);
  });

  it("returns an empty string unchanged", () => {
    expect(sanitizeForSheets("")).toBe("");
  });
});
