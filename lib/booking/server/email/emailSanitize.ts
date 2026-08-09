// SERVER-ONLY. Secondary defense against email header injection (STEP 13).
//
// PRIMARY defense: header-bound values (the subject line, the "to"/"from"
// addresses) are never built by concatenating raw customer input into a
// literal header string — mimeMessage.ts always places customer-controlled
// free text (the email body) after the blank line that separates MIME
// headers from the body, where newlines are just newlines, not new
// headers. The recipient address is also independently re-validated
// server-side (validateSubmission.ts's isValidEmail, which already
// rejects any whitespace character) before it ever reaches this module.
//
// This function is the belt-and-suspenders SECOND layer: strips CR/LF from
// any value that will be placed on a MIME header line, so a future code
// path that ever interpolates customer text into a header can't be used to
// inject an additional header (e.g. a forged Bcc) via embedded newlines.
import "server-only";

export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
