import { beforeEach, describe, expect, it } from "vitest";
import {
  authorizeUrl,
  clearToken,
  getToken,
  logoutUrl,
  tokenEmail,
} from "../src/lib/auth";

const jwt = (payload: object) =>
  `x.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;
const NOW = 1_800_000_000_000;
const config = { cognitoDomain: "wm.auth.example.com", clientId: "abc", devLogin: false };

beforeEach(() => sessionStorage.clear());

describe("token storage", () => {
  it("returns a live token and reads its email", () => {
    const token = jwt({ exp: NOW / 1000 + 3600, email: "huy@example.com" });
    sessionStorage.setItem("wm.token", token);
    expect(getToken(NOW)).toBe(token);
    expect(tokenEmail(token)).toBe("huy@example.com");
  });

  it("drops an expired, nearly expired or unreadable token", () => {
    for (const token of [
      jwt({ exp: NOW / 1000 - 1 }),
      jwt({ exp: NOW / 1000 + 10 }),
      "not-a-jwt",
    ]) {
      sessionStorage.setItem("wm.token", token);
      expect(getToken(NOW)).toBeNull();
      expect(sessionStorage.getItem("wm.token")).toBeNull();
    }
  });

  it("treats a local test token as live", () => {
    sessionStorage.setItem("wm.token", "test:admin@example.com");
    expect(getToken(NOW)).toBe("test:admin@example.com");
    expect(tokenEmail("test:admin@example.com")).toBe("admin@example.com");
    clearToken();
    expect(getToken(NOW)).toBeNull();
  });
});

describe("Cognito URLs", () => {
  it("sends the browser straight to Google with PKCE", () => {
    const url = new URL(
      authorizeUrl(config, "https://site.example/quan-tri/", "CHALLENGE", "STATE"),
    );
    expect(url.origin + url.pathname).toBe(
      "https://wm.auth.example.com/oauth2/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "abc",
      redirect_uri: "https://site.example/quan-tri/",
      scope: "openid email",
      identity_provider: "Google",
      code_challenge: "CHALLENGE",
      code_challenge_method: "S256",
      state: "STATE",
    });
  });

  it("builds the sign-out URL", () => {
    expect(logoutUrl(config, "https://site.example/quan-tri/")).toBe(
      "https://wm.auth.example.com/logout?client_id=abc&logout_uri=https%3A%2F%2Fsite.example%2Fquan-tri%2F",
    );
  });
});
