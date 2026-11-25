// Server-only bridge from the platform fetch context to individual server routes.
//
// Lovable's current TanStack/Nitro build targets a Cloudflare-style runtime,
// where the third server-entry argument can expose waitUntil(). Routes only
// receive a Request, so keep the relationship in a WeakMap rather than global
// mutable state. If a deployment target does not provide waitUntil, callers
// simply keep their existing fallback behavior.
type RuntimeContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

const requestRuntime = new WeakMap<Request, RuntimeContext>();

export function bindRequestRuntimeContext(request: Request, context: unknown): void {
  if (!context || typeof context !== "object") return;
  const candidate = context as RuntimeContext;
  if (typeof candidate.waitUntil === "function") {
    requestRuntime.set(request, candidate);
  }
}

export function keepRequestAlive(request: Request, promise: Promise<unknown>): boolean {
  const context = requestRuntime.get(request);
  if (!context || typeof context.waitUntil !== "function") return false;
  context.waitUntil(promise);
  return true;
}
