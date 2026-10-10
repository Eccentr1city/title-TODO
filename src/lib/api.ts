// Fetch wrapper for the app's JSON API: throws with the server's error message
// on failure, so callers can surface it instead of silently doing nothing.
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

// Runs `fn` now, then every `ms` while the page is visible, and again whenever
// it becomes visible (a resumed home-screen app shows stale data otherwise).
export function pollWhileVisible(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => { timer ??= setInterval(fn, ms); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const onVisibility = () => {
    if (document.visibilityState === "visible") { fn(); start(); } else stop();
  };
  fn();
  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
}
