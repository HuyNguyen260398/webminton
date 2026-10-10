import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdmin } from "../src/lib/use-admin";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const state = (version: number) => ({
  ...makeAdminState(),
  version,
  publishedVersion: version,
});
const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
let calls: { url: string; init?: RequestInit }[];
let handler: (url: string, init?: RequestInit) => unknown;

beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/config")
        return json(200, { cognitoDomain: null, clientId: null, devLogin: true });
      return handler(url, init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const ready = async () => {
  sessionStorage.setItem("wm.token", "test:admin@example.com");
  const hook = renderHook(() => useAdmin());
  await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
  return hook;
};
const cmd = { type: "updateInfo", payload: { feeVnd: 1 } } as const;
const bodyOf = (i: number) => JSON.parse(calls[i].init!.body as string);

describe("useAdmin", () => {
  it("asks for sign-in when there is no token", async () => {
    handler = () => json(200, state(1));
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.phase).toBe("signed-out"));
    expect(calls.map((c) => c.url)).toEqual(["/api/config"]);
  });

  it("loads the state and identifies the organiser", async () => {
    handler = () => json(200, state(4));
    const { result } = await ready();
    expect(result.current.view?.version).toBe(4);
    expect(result.current.email).toBe("admin@example.com");
    expect(
      (calls[1].init!.headers as Record<string, string>).authorization,
    ).toBe("Bearer test:admin@example.com");
  });

  it("shows a refusal page for an account that is not allow-listed", async () => {
    handler = () => json(403, { code: "FORBIDDEN", message: "Không có quyền." });
    sessionStorage.setItem("wm.token", "test:la@example.com");
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.phase).toBe("forbidden"));
  });

  it("sends a command against the version on screen and confirms the save", async () => {
    handler = (url) => json(200, url.endsWith("/commands") ? state(5) : state(4));
    const { result } = await ready();
    let saved = false;
    await act(async () => {
      saved = await result.current.send(cmd);
    });
    expect(saved).toBe(true);
    expect(bodyOf(2)).toMatchObject({ baseVersion: 4, command: cmd });
    expect(bodyOf(2).requestId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(result.current.view?.version).toBe(5);
    expect(result.current.notice).toEqual({ tone: "ok", text: "Đã lưu." });
  });

  it("reloads and warns when another device saved first", async () => {
    let stateCalls = 0;
    handler = (url) =>
      url.endsWith("/commands")
        ? json(409, { code: "CONFLICT", message: "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại." })
        : json(200, state(++stateCalls === 1 ? 4 : 7));
    const { result } = await ready();
    await act(async () => {
      expect(await result.current.send(cmd)).toBe(false);
    });
    expect(result.current.view?.version).toBe(7);
    expect(result.current.notice).toEqual({
      tone: "warn",
      text: "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.",
    });
  });

  it("reuses the request id when the same save is retried after a network failure", async () => {
    let attempt = 0;
    handler = (url) => {
      if (!url.endsWith("/commands")) return json(200, state(4));
      if (++attempt === 1) throw new TypeError("Failed to fetch");
      return json(200, state(5));
    };
    const { result } = await ready();
    await act(async () => {
      expect(await result.current.send(cmd)).toBe(false);
    });
    expect(result.current.notice?.tone).toBe("error");
    await act(async () => {
      expect(await result.current.send(cmd)).toBe(true);
    });
    expect(bodyOf(3).requestId).toBe(bodyOf(2).requestId);
    // A different edit is a different request.
    await act(async () => {
      await result.current.send({ type: "updateInfo", payload: { feeVnd: 2 } });
    });
    expect(bodyOf(4).requestId).not.toBe(bodyOf(2).requestId);
  });

  it("warns when the save landed but the page was not republished", async () => {
    handler = (url) =>
      json(200, url.endsWith("/commands") ? { ...state(5), published: false } : state(4));
    const { result } = await ready();
    await act(async () => {
      await result.current.send(cmd);
    });
    expect(result.current.notice?.tone).toBe("warn");
    expect(result.current.notice?.text).toContain("chưa công bố");
  });

  it("goes back to sign-in and keeps the edit when the token is rejected", async () => {
    handler = (url) =>
      url.endsWith("/commands") ? json(401, { message: "Unauthorized" }) : json(200, state(4));
    const { result } = await ready();
    await act(async () => {
      await result.current.send(cmd);
    });
    expect(result.current.phase).toBe("signed-out");
    expect(JSON.parse(sessionStorage.getItem("wm.pending")!)).toMatchObject({
      path: "/api/admin/commands",
      body: { command: cmd },
    });
    expect(sessionStorage.getItem("wm.token")).toBeNull();
  });
});
