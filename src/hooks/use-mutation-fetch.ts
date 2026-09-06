"use client";
import { useRef } from "react";
export function useMutationFetch() {
  const keys = useRef(new Map<string, string>());
  return async (url: string, options: RequestInit) => {
    const bodyHash =
      options.body instanceof ArrayBuffer
        ? Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", options.body)),
          )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        : options.body;
    const signature = JSON.stringify([
      url,
      options.method,
      bodyHash,
      [...new Headers(options.headers).entries()],
    ]);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    const headers = new Headers(options.headers);
    headers.set("Idempotency-Key", key);
    const response = await fetch(url, { ...options, headers });
    if (response.ok) keys.current.delete(signature);
    return response;
  };
}
