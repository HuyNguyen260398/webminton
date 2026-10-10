export type Claims = Record<string, unknown> | undefined;

export function parseEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// API Gateway has already verified the token's signature, issuer and
// audience. This is the second check: is this person an organiser?
export function requireAdmin(claims: Claims, adminEmails: string[]): string {
  const email =
    typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (!email) throw new Error("UNAUTHORIZED");
  const verified =
    claims?.email_verified === true || claims?.email_verified === "true";
  if (!verified || !adminEmails.includes(email)) throw new Error("FORBIDDEN");
  return email;
}
