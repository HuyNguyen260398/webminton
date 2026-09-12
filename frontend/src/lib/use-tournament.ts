"use client";
import { useCallback, useEffect, useState } from "react";
import { getPublicTournament, type PublicTournament } from "./api";
export function useTournament() {
  const [data, setData] = useState<PublicTournament | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await getPublicTournament());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  return { data, error, refresh };
}
