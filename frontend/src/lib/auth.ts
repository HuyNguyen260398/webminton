export interface AuthConfig {
  cognitoDomain: string | null;
  clientId: string | null;
  devLogin: boolean;
}

export const DEV_EMAIL = "admin@example.com";
const TOKEN = "wm.token";
const VERIFIER = "wm.verifier";
const STATE = "wm.state";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function claims(token: string): { exp?: unknown; email?: unknown } {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(part), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

const isTest = (token: string) => token.startsWith("test:");

export function tokenEmail(token: string): string {
  if (isTest(token)) return token.slice(5);
  const { email } = claims(token);
  return typeof email === "string" ? email : "";
}

// The API verifies the token; this only saves a round trip that would fail.
// Thirty seconds of margin so a save is not sent with a token about to lapse.
export function getToken(now = Date.now()): string | null {
  const token = sessionStorage.getItem(TOKEN);
  if (!token) return null;
  if (isTest(token)) return token;
  const { exp } = claims(token);
  if (typeof exp === "number" && exp * 1000 > now + 30_000) return token;
  sessionStorage.removeItem(TOKEN);
  return null;
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN);
}

export const redirectUri = () => `${location.origin}/quan-tri/`;

export function authorizeUrl(
  c: AuthConfig,
  redirect: string,
  challenge: string,
  state: string,
): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId ?? "",
    redirect_uri: redirect,
    scope: "openid email",
    // Skips Cognito's own page: Google is the only way in.
    identity_provider: "Google",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `https://${c.cognitoDomain}/oauth2/authorize?${q}`;
}

export function logoutUrl(c: AuthConfig, redirect: string): string {
  const q = new URLSearchParams({
    client_id: c.clientId ?? "",
    logout_uri: redirect,
  });
  return `https://${c.cognitoDomain}/logout?${q}`;
}

export async function loadConfig(): Promise<AuthConfig> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new Error("Không tải được cấu hình đăng nhập.");
  return (await res.json()) as AuthConfig;
}

export async function beginLogin(c: AuthConfig): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(STATE, state);
  location.assign(
    authorizeUrl(c, redirectUri(), b64url(new Uint8Array(digest)), state),
  );
}

// Only reachable when /api/config says devLogin, which the Lambda never does.
export function devSignIn() {
  sessionStorage.setItem(TOKEN, `test:${DEV_EMAIL}`);
}

async function exchange(c: AuthConfig): Promise<boolean> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const failed = url.searchParams.get("error");
  if (!code && !failed) return false;
  const verifier = sessionStorage.getItem(VERIFIER);
  const state = sessionStorage.getItem(STATE);
  sessionStorage.removeItem(VERIFIER);
  sessionStorage.removeItem(STATE);
  // The code is single-use; take it out of the address bar before anything.
  history.replaceState(null, "", url.pathname);
  if (failed) throw new Error("Đăng nhập Google không thành công. Thử lại.");
  if (!verifier || url.searchParams.get("state") !== state)
    throw new Error("Phiên đăng nhập không hợp lệ. Thử lại.");
  const res = await fetch(`https://${c.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId ?? "",
      code: code!,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("Không đổi được mã đăng nhập. Thử lại.");
  const { id_token } = (await res.json()) as { id_token: string };
  sessionStorage.setItem(TOKEN, id_token);
  return true;
}

let inflight: Promise<boolean> | null = null;
// Memoised: React runs effects twice in development, and the code works once.
export function completeLogin(c: AuthConfig): Promise<boolean> {
  return (inflight ??= exchange(c));
}
