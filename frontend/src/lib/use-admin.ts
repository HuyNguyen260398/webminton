"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Command } from "../../../packages/domain/src/commands";
import { api, ApiError, type AdminView } from "./admin-api";
import {
  beginLogin,
  clearToken,
  completeLogin,
  devSignIn,
  getToken,
  loadConfig,
  logoutUrl,
  redirectUri,
  tokenEmail,
  type AuthConfig,
} from "./auth";

export type Phase = "loading" | "signed-out" | "forbidden" | "error" | "ready";
export interface Notice {
  tone: "ok" | "warn" | "error";
  text: string;
}
export interface Admin {
  phase: Phase;
  config: AuthConfig | null;
  view: AdminView | null;
  email: string;
  busy: boolean;
  notice: Notice | null;
  send(command: Command, saved?: string): Promise<boolean>;
  restore(version: number): Promise<boolean>;
  republish(): Promise<void>;
  query<T>(path: string, body?: unknown): Promise<T | null>;
  reload(): Promise<boolean>;
  signIn(): void;
  signOut(): void;
}
export type ReadyAdmin = Admin & { view: AdminView };

const PENDING = "wm.pending";
type Pending = { path: string; body: Record<string, unknown> };

export function useAdmin(): Admin {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [view, setViewState] = useState<AdminView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  // The version a save is based on must be the one on screen right now, not
  // the one captured when a callback was created.
  const current = useRef<AdminView | null>(null);
  const retry = useRef<{ key: string; requestId: string } | null>(null);

  const setView = useCallback((v: AdminView) => {
    current.current = v;
    setViewState(v);
  }, []);

  // Returns true when the error ended the session and was handled here.
  const fail = useCallback((e: unknown): boolean => {
    if (e instanceof ApiError && e.status === 401) {
      clearToken();
      setPhase("signed-out");
      setNotice({ tone: "warn", text: e.message });
      return true;
    }
    if (e instanceof ApiError && e.status === 403) {
      setPhase("forbidden");
      return true;
    }
    setNotice({
      tone: "error",
      text: e instanceof Error ? e.message : "Lỗi không xác định.",
    });
    return false;
  }, []);

  const reload = useCallback(async () => {
    try {
      setView(await api<AdminView>("/api/admin/state"));
      setEmail(tokenEmail(getToken() ?? ""));
      setPhase("ready");
      return true;
    } catch (e) {
      if (!fail(e)) setPhase((p) => (p === "ready" ? p : "error"));
      return false;
    }
  }, [fail, setView]);

  const post = useCallback(
    async (
      path: string,
      extra: Record<string, unknown>,
      saved: string,
      requestId?: string,
    ): Promise<boolean> => {
      const base = current.current;
      if (!base) return false;
      // Same edit retried after a dropped connection: same id, so if the
      // first attempt did land the server answers "already done".
      const key = JSON.stringify([path, extra]);
      const id =
        requestId ??
        (retry.current?.key === key
          ? retry.current.requestId
          : crypto.randomUUID());
      const body = { baseVersion: base.version, requestId: id, ...extra };
      setBusy(true);
      try {
        const next = await api<AdminView>(path, body);
        retry.current = null;
        setView(next);
        setNotice(
          next.published === false
            ? {
                tone: "warn",
                text: `${saved} Nhưng trang giải chưa công bố được — bấm “Công bố lại”.`,
              }
            : { tone: "ok", text: saved },
        );
        return true;
      } catch (e) {
        retry.current =
          e instanceof ApiError && e.code === "NETWORK"
            ? { key, requestId: id }
            : null;
        if (e instanceof ApiError && e.status === 409) {
          await reload();
          setNotice({ tone: "warn", text: e.message });
        } else if (e instanceof ApiError && e.status === 401) {
          const pending: Pending = { path, body: { requestId: id, ...extra } };
          sessionStorage.setItem(PENDING, JSON.stringify(pending));
          fail(e);
        } else fail(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [fail, reload, setView],
  );

  // After signing in again, finish the save that the expired token interrupted.
  const resume = useCallback(async () => {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return;
    sessionStorage.removeItem(PENDING);
    const { path, body } = JSON.parse(raw) as Pending;
    const { requestId, ...extra } = body;
    await post(
      path,
      extra,
      "Đã đăng nhập lại và lưu thao tác còn dang dở.",
      requestId as string,
    );
  }, [post]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await loadConfig();
        if (!alive) return;
        setConfig(c);
        await completeLogin(c);
        if (!alive) return;
        if (!getToken()) return setPhase("signed-out");
        if (await reload()) await resume();
      } catch (e) {
        if (!alive) return;
        setPhase("error");
        setNotice({
          tone: "error",
          text: e instanceof Error ? e.message : "Lỗi không xác định.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [reload, resume]);

  const send = useCallback(
    (command: Command, saved = "Đã lưu.") =>
      post("/api/admin/commands", { command }, saved),
    [post],
  );

  const restore = useCallback(
    (version: number) =>
      post(
        "/api/admin/restore",
        { version },
        `Đã khôi phục phiên bản ${version}.`,
      ),
    [post],
  );

  const query = useCallback(
    async <T>(path: string, body?: unknown): Promise<T | null> => {
      try {
        return await api<T>(path, body);
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [fail],
  );

  const republish = useCallback(async () => {
    setBusy(true);
    const next = await query<AdminView>("/api/admin/publish", {});
    setBusy(false);
    if (!next) return;
    setView(next);
    setNotice(
      next.published === false
        ? { tone: "error", text: "Vẫn chưa công bố được. Thử lại sau ít phút." }
        : { tone: "ok", text: "Đã công bố lại trang giải." },
    );
  }, [query, setView]);

  const signIn = useCallback(() => {
    if (!config) return;
    if (config.devLogin) {
      devSignIn();
      setPhase("loading");
      void reload().then((ok) => {
        if (ok) void resume();
      });
    } else void beginLogin(config);
  }, [config, reload, resume]);

  const signOut = useCallback(() => {
    clearToken();
    sessionStorage.removeItem(PENDING);
    if (config && !config.devLogin)
      location.assign(logoutUrl(config, redirectUri()));
    else setPhase("signed-out");
  }, [config]);

  return {
    phase,
    config,
    view,
    email,
    busy,
    notice,
    send,
    restore,
    republish,
    query,
    reload,
    signIn,
    signOut,
  };
}
