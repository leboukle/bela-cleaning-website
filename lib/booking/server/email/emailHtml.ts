// SERVER-ONLY. Shared HTML-escaping for email template bodies — every
// customer-controlled value interpolated into an HTML email must go
// through this first, the same way React escapes text nodes by default.
import "server-only";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
