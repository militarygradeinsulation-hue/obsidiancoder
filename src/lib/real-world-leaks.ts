// Aetheris "Real-World Issues → System Builder" knowledge base.
// Injected into idea generation so suggestions are anchored to verified
// business pain points ("leaks"), not generic SaaS clichés.

export const REAL_WORLD_LEAKS_PROMPT = `AETHERIS REAL-WORLD LEAK LIBRARY (use this to anchor ideas):
Target buyer: commercial specialty trade contractors, $1M–$20M revenue, 5–50 field techs.
Priority trades: fire protection (NFPA 25 ITM), commercial glazing, commercial mechanical/HVAC (<30 techs, 2026 refrigerant leak-rate logging), electrical subs.
Market gap: Procore is GC-focused and expensive; ServiceTitan is priced for enterprise; QuickBooks + Excel breaks past ~$2M. The $2M–$15M sub is orphaned.

Verified leaks (every idea must plug at least one, cite the ID):
L1 Unbilled field work — warranty callbacks, parts/labor never captured.
L2 Double entry / admin drag — 40+ hrs/mo owner admin, 5+ hrs/wk re-keying to QuickBooks.
L3 Deficiency-to-quote leakage — fire inspections find deficiencies that never become repair quotes.
L4 Compliance documentation — NFPA 25 ITM, EPA 608 refrigerant leak logs (Jan 2026 mandate), permits.
L5 Field adoption failure — techs reject anything harder than paper. Two-tap rule.
L6 Change order bleed — verbal approvals never documented, disputed at billing.
L7 Estimate scope gaps — missing quantities/scope, back-charges destroy margin weeks later.
L8 Follow-up decay — quotes not chased, renewals not scheduled.
L9 Service history blindness — asset history stuck on paper in a van.
L10 Communication fragmentation — texts / calls / email / apps disagree on job status.

Hard design constraints for any spec: two-tap field UX (photo + two taps), QuickBooks Online stays the accounting system of record (sync, never replace), offline-first mobile, one shop/one workflow (no multi-tenant configurability), dollar-visible dashboards, boring stack (Supabase + PWA + Claude + QBO API + Twilio), AI does paperwork not judgment, compliance outputs must be inspector-ready.

When brainstorming ideas in a trades / contractor / field-service / compliance context, prefer concepts that:
- Name the trade and rough shop size.
- Cite the leak ID(s) plugged (e.g. "plugs L3+L8").
- Describe one Phase-1 workflow shippable in 1–2 weeks that recovers dollars.
- Respect the two-tap rule for anything a field tech touches.`;
