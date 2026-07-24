## Fix the repeated build timeout

**Confirmed signal**
- Production logs show repeated `POST /api/generate` responses ending in HTTP `504` between 16:04 and 16:15 UTC.
- The generation route performs image and 21st.dev enrichment before opening the output stream, then permits an 8-second primary attempt plus a 15-second fallback. The fallback carries the same potentially 90 KB component context, so the request can exhaust the platform response window before returning a first token.
- No failed Lovable AI Gateway calls were recorded in the same window, so the available evidence points to the app route’s pre-stream/upstream timing path rather than a logged Gateway provider rejection.

### Implementation
1. **Apply one hard first-response budget to the entire route**
   - Start the deadline when `/api/generate` begins.
   - Give optional image and 21st.dev enrichment only a small bounded share of that deadline.
   - Skip unfinished enrichment when its budget expires rather than failing the build.

2. **Make fallback immediate and lightweight**
   - On first-byte timeout in Auto mode, cancel the original reader/request cleanly.
   - Retry with the fast default model using a compact prompt that omits heavy 21st.dev source payloads and generated-image data when necessary.
   - Preserve pinned-model behavior, but return a clear retryable timeout instead of hanging.

3. **Reduce avoidable model latency**
   - Lower the injected component-code ceiling from the current 90 KB to a bounded, quality-focused subset.
   - Keep prioritized hero/features/pricing patterns, but exclude excess references that inflate prompt processing.
   - Ensure optional enrichments remain quality helpers, never blockers.

4. **Improve timeout diagnostics and recovery**
   - Normalize `first_byte_timeout` into the existing `ai_timeout` envelope.
   - Include the request ID and stage in the UI error state and retain the last stable preview.
   - Add timing fields for enrichment, primary attempt, and fallback so future failures are attributable.

5. **Verify the real path**
   - Run targeted generation-route tests for slow primary, successful fast fallback, slow 21st.dev enrichment, and pinned-model timeout.
   - Send a real build through `/api/generate` and confirm it returns streaming output rather than 504 while preserving the existing credit settlement behavior.