import { describe, it, expect } from "vitest";
import { sanitizeHeaderValue } from "./emailSanitize";

describe("sanitizeHeaderValue", () => {
  it("leaves normal text unchanged", () => {
    expect(sanitizeHeaderValue("customer@example.com")).toBe("customer@example.com");
  });

  it("strips embedded carriage returns and newlines (header injection attempt)", () => {
    const attempt = "victim@example.com\r\nBcc: attacker@evil.example\r\nSubject: hijacked";
    const sanitized = sanitizeHeaderValue(attempt);
    expect(sanitized).not.toMatch(/[\r\n]/);
    expect(sanitized).toContain("victim@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeHeaderValue("  spaced out  ")).toBe("spaced out");
  });
});
