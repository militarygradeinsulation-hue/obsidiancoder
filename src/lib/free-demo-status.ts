// Pure resolver for the client-side free-demo status. The server is the
// source of truth; localStorage is a display cache and MUST NEVER override
// the server. Extracted for unit testability — no imports, no side effects.

export interface DemoStatusServer {
  available?: boolean;
  alreadyUsed?: boolean;
}

export interface DemoStatusResolved {
  /** UI state — true means "the visitor has consumed their demo". */
  used: boolean;
  /** True only when the server confirmed availability. */
  available: boolean;
  /** True when the server responded but the ledger is not usable. */
  ledgerUnavailable: boolean;
  /** What obs.demoUsed in localStorage should be set to (null = remove). */
  localStorageWrite: "1" | null;
  /** Whether the submit guard should permit a network call. */
  submitAllowed: boolean;
}

/** Resolve state from a successful server status response. */
export function resolveFromServer(j: DemoStatusServer): DemoStatusResolved {
  const used = j.alreadyUsed === true;
  const available = j.available === true;
  const ledgerUnavailable = !available && !used;
  return {
    used,
    available,
    ledgerUnavailable,
    // Server wins — mirror alreadyUsed exactly. If it's false, clear any
    // stale flag so a cleared/mismatched localStorage cannot block a demo.
    localStorageWrite: used ? "1" : null,
    submitAllowed: available && !used,
  };
}

/** Resolve state when the status endpoint fails / is unreachable. */
export function resolveOnStatusError(): DemoStatusResolved {
  return {
    used: false,
    available: false,
    ledgerUnavailable: true,
    localStorageWrite: null,
    submitAllowed: false,
  };
}

/** Central submit-time guard. Server truth first, localStorage never wins. */
export function shouldAllowDemoSubmit(args: {
  demoAvailable: boolean | null;
  demoUsed: boolean;
}): boolean {
  if (args.demoAvailable === null) return false; // unresolved → refuse
  if (args.demoAvailable === false) return false;
  if (args.demoUsed) return false;
  return true;
}
