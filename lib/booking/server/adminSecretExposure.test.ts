// Regression guard for the specific security correction requested: the
// internal admin secret must never be embedded in a URL, a client
// component prop, or any browser-visible state. This reads the actual
// source of the internal-tool's client components and the page route
// directory structure and asserts the secret-in-URL pattern is gone —
// a static safeguard against someone reintroducing
// /internal/[adminSecret]/... or an `adminSecret` prop later.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

describe("internal admin secret exposure", () => {
  it("the old dynamic [adminSecret] URL segment route no longer exists", () => {
    expect(existsSync(join(ROOT, "app", "internal", "[adminSecret]"))).toBe(false);
  });

  it("the permanent, fixed internal assignment page path exists", () => {
    expect(existsSync(join(ROOT, "app", "internal", "assign-cleaner", "page.tsx"))).toBe(true);
  });

  it("AssignCleanerForm.tsx never references an adminSecret prop or the secret env var name", () => {
    const source = readFileSync(join(ROOT, "components", "internal", "AssignCleanerForm.tsx"), "utf8");
    expect(source).not.toContain("adminSecret");
    expect(source).not.toContain("x-internal-admin-secret");
    expect(source).not.toContain("INTERNAL_ADMIN_SECRET");
  });

  it("AdminLoginForm.tsx never persists the entered secret to localStorage/sessionStorage or a URL", () => {
    const source = readFileSync(join(ROOT, "components", "internal", "AdminLoginForm.tsx"), "utf8");
    // Checks actual API usage, not the bare word — this file's own
    // explanatory comments legitimately mention both APIs by name to
    // document that they are NOT used.
    expect(source).not.toMatch(/localStorage\s*\./);
    expect(source).not.toMatch(/sessionStorage\s*\./);
    // The secret is sent only in a POST body, never appended to a URL/query string.
    expect(source).not.toMatch(/[?&]secret=/);
  });

  it("the internal page's own Server Component never passes a secret-shaped prop to its children", () => {
    const source = readFileSync(join(ROOT, "app", "internal", "assign-cleaner", "page.tsx"), "utf8");
    expect(source).not.toContain("adminSecret");
  });
});
