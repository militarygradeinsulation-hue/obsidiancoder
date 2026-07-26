// Lightweight free-demo analytics — uses the same window.dispatchEvent
// convention as the rest of the project (see `obs:paywall`). No vendors,
// no fingerprint, no PII. Consumers may subscribe via `window.addEventListener`.
//
// Emissions are at-most-once per browser lifetime for `started` and
// `completed`; `upgrade_clicked` and `sign_in_clicked` may fire multiple
// times (each click is an event).

export type DemoAnalyticsEvent =
  | "free_demo_started"
  | "free_demo_completed"
  | "free_demo_upgrade_clicked"
  | "free_demo_sign_in_clicked";

const oncePerSession = new Set<DemoAnalyticsEvent>([
  "free_demo_started",
  "free_demo_completed",
]);
const emitted = new Set<DemoAnalyticsEvent>();

export function trackDemoEvent(event: DemoAnalyticsEvent): void {
  if (typeof window === "undefined") return;
  if (oncePerSession.has(event) && emitted.has(event)) return;
  emitted.add(event);
  try {
    window.dispatchEvent(new CustomEvent("obs:analytics", { detail: { event } }));
  } catch { /* noop */ }
  try {
    // Also visible to any dev tooling / server-side log forwarders.
    // eslint-disable-next-line no-console
    console.info("[obs.analytics]", event);
  } catch { /* noop */ }
}

/** Test-only reset. Not exported through any router path. */
export function __resetDemoAnalyticsForTests(): void {
  emitted.clear();
}
