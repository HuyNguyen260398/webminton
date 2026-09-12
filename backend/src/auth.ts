export function requireAdmin(
  claims: Record<string, string> | undefined,
  config: { issuer: string; clientId: string },
) {
  if (!claims?.sub) throw new Error("UNAUTHORIZED");
  const groups = (claims["cognito:groups"] ?? "")
    .replace(/[\[\]"]/g, "")
    .split(",")
    .map((x) => x.trim());
  if (
    !config.issuer ||
    !config.clientId ||
    claims.iss !== config.issuer ||
    claims.client_id !== config.clientId ||
    claims.token_use !== "access" ||
    !groups.includes("admins") ||
    !claims.scope?.split(" ").includes("tournament/admin")
  )
    throw new Error("FORBIDDEN");
  return claims.sub;
}
