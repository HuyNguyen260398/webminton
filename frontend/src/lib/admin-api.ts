import type { AdminState } from "../../../packages/domain/src/commands";
import { getToken } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AdminView extends AdminState {
  version: number;
  publishedVersion: number;
  published?: boolean;
}

// GET without a body, POST with one. Every failure is an ApiError whose
// message is already Vietnamese and fit to show.
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Cần đăng nhập.");
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối — kiểm tra mạng rồi thử lại.");
  }
  const data = (await res.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.code ?? "UNKNOWN",
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn."
        : (data?.message ?? `Lỗi ${res.status}.`),
    );
  return data as T;
}
