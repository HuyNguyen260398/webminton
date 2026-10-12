import type {
  DuelMatch,
  RefereeSave,
} from "../../../packages/domain/src/schema";

// `code` is the API's error code. "NETWORK" is the one that means the save
// did not get through and should be sent again; every other is a refusal.
export class RefereeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const OFFLINE = "Mất mạng — đang thử lại.";

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      // The last taps are sent as the phone locks; let them finish.
      keepalive: true,
    });
  } catch {
    throw new RefereeError("NETWORK", OFFLINE);
  }
  // A throttle is API Gateway asking for a moment, and a 409 is the other
  // court winning the version five times running. Neither is a no.
  if (res.status === 409 || res.status === 429 || res.status >= 500)
    throw new RefereeError("NETWORK", OFFLINE);
  const data = (await res.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  if (!res.ok)
    throw new RefereeError(
      data?.code ?? "UNKNOWN",
      data?.message ?? `Lỗi ${res.status}.`,
    );
  return data as T;
}

export const checkCode = async (code: string): Promise<void> => {
  await post("/api/referee/check", { code });
};
export const saveMatch = (code: string, matchId: string, save: RefereeSave) =>
  post<{ match: DuelMatch; updatedAt: string }>("/api/referee/match", {
    code,
    matchId,
    ...save,
  });

// The code, kept on this phone so a reload mid-match does not ask again.
// Storage can be blocked; then it is simply asked for on every load.
const KEY = "wm.referee";
export function readCode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function storeCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Nothing to do: the code lives for this page load only.
  }
}
export function forgetCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}

// Who is holding this phone, so the next match starts with their name picked.
const NAME_KEY = "wm.referee.name";
export function readName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}
export function storeName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Asked again next match.
  }
}
