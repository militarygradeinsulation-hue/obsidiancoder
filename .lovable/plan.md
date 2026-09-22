# Remove build-error sources

## Goal
Stop malformed QA replies, invalid generated JavaScript, and unsafe navigation from being created or reaching the end-of-build gate.

## Changes
1. Remove the optional AI QA round-trip from every build completion path. Deterministic validation and repair remain authoritative, eliminating `qa_bad_response` and its extra latency.
2. Strengthen the generation contract so generated apps use only same-page interactions, never `window.open`, `location.assign`, `location.replace`, or location writes.
3. Require small, independently valid script blocks and complete closing syntax; keep deterministic pre-commit normalization as a final safety net.
4. Update regression checks to prove malformed QA cannot be dispatched during completion and generated navigation/script defects are repaired before commit.
5. Run the project’s complete self-test suites and verify a build can reach its usable result without a QA request.

## Technical details
- Keep `/api/qa` available only if another explicit review feature uses it; the build finalizer will no longer depend on it.
- Do not weaken structural validation for truncated HTML or runtime failures.
- Preserve existing save, preview, publish, and interaction behavior.
