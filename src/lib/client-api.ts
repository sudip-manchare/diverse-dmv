"use client";
import { useCallback, useEffect, useState } from "react";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public retryAt?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-protection": "1",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body.error || body;
    if (response.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      error.code || "UNAVAILABLE",
      error.message || "We couldn’t complete this. Try again.",
      error.fields,
      error.retryAt,
    );
  }
  return body;
}
export function useResource<T = any>(path: string | null, interval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const next = await api<T>(path);
      setData(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e as ApiError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    let active = true,
      busy = false;
    setData(null);
    setError(null);
    setLoading(true);
    const load = async () => {
      if (busy || !active || !path) return;
      busy = true;
      try {
        const next = await api<T>(path);
        if (active) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (active) {
          setData(null);
          setError(e as ApiError);
        }
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = interval
      ? setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, interval)
      : null;
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [path, interval]);
  return { data, error, loading, reload };
}
export const mutation = (path: string, body?: unknown, method = "POST") =>
  api(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
