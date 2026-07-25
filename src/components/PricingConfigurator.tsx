// Interactive "Choose Your Investment" pricing configurator.
// Vertical dollar scroller that snaps to supported plan anchors. Wheel,
// drag, keyboard, touch, and range-slider fallback. Live feature reveal
// updates as the amount changes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";
import { PLAN_TIERS, TRY_PRO_PRICE_ID, type PlanTier, type PlanTierId } from "@/lib/plans";

interface Anchor {
  amount: number;
  tierId: PlanTierId | "enterprise_plus";
  label: string;
  priceId?: string;
  tier?: PlanTier;
  cta: "checkout" | "contact";
  href?: string;
}

const ANCHORS: Anchor[] = [
  { amount: 5,   tierId: "try_pro",       label: "Try Pro (7-day trial)",   priceId: TRY_PRO_PRICE_ID, cta: "checkout" },
  { amount: 29,  tierId: "starter",       label: "Starter",                  priceId: "obsidian_starter_monthly", cta: "checkout" },
  { amount: 79,  tierId: "creator",       label: "Creator — Recommended",    priceId: "obsidian_creator_monthly", cta: "checkout" },
  { amount: 149, tierId: "professional",  label: "Professional",             priceId: "obsidian_professional_monthly", cta: "checkout" },
  { amount: 299, tierId: "business",      label: "Business",                 priceId: "obsidian_business_monthly", cta: "checkout" },
  { amount: 499, tierId: "elite",         label: "Elite",                    priceId: "obsidian_elite_monthly", cta: "checkout" },
  { amount: 500, tierId: "enterprise",    label: "Enterprise / Contact Sales", cta: "contact", href: "mailto:sales@obsidianvibe.live?subject=Enterprise%20inquiry" },
].map(a => ({ ...a, tier: PLAN_TIERS.find(t => t.id === a.tierId) })) as Anchor[];

// Full feature grid. `min` is the anchor amount at which this feature unlocks.
interface Feature { label: string; min: number; soon?: boolean }
const FEATURES: Feature[] = [
  { label: "Best default AI model",          min: 5 },
  { label: "1 premium project (7 days)",     min: 5 },
  { label: "Deploy & share your build",      min: 5 },
  { label: "Unlimited builds",               min: 79 },
  { label: "Permanent save",                 min: 79 },
  { label: "Premium model access",           min: 79 },
  { label: "Exports (HTML / ZIP)",           min: 79 },
  { label: "Auth & database",                min: 79 },
  { label: "Higher usage limits",            min: 149 },
  { label: "API integrations",               min: 149 },
  { label: "Priority support",               min: 149 },
  { label: "Team seats & collaboration",     min: 299, soon: true },
  { label: "White-label / client work",      min: 299, soon: true },
  { label: "Custom domains",                 min: 299 },
  { label: "Version history",                min: 299, soon: true },
  { label: "Maximum AI capacity",            min: 499 },
  { label: "Fastest generation queue",       min: 499 },
  { label: "Dedicated success partner",      min: 500 },
  { label: "SSO, SCIM, RBAC",                min: 500, soon: true },
  { label: "Custom SLAs & procurement",      min: 500 },
];

const MIN_AMOUNT = 5;
const MAX_AMOUNT = 500;
const DEFAULT_AMOUNT = 79;
const PENDING_PRICE_KEY = "obs:pending_priceId";
const PENDING_AMOUNT_KEY = "obs:pending_amount";

function nearestAnchor(amount: number): Anchor {
  return ANCHORS.reduce((best, a) =>
    Math.abs(a.amount - amount) < Math.abs(best.amount - amount) ? a : best,
  ANCHORS[0]);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function PricingConfigurator() {
  const [amount, setAmount] = useState<number>(DEFAULT_AMOUNT);
  const anchor = useMemo(() => nearestAnchor(amount), [amount]);
  const lastAnchorRef = useRef<number>(anchor.amount);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track("pricing_configurator_viewed");
  }, []);

  useEffect(() => {
    if (lastAnchorRef.current !== anchor.amount) {
      lastAnchorRef.current = anchor.amount;
      track("pricing_anchor_selected", { amount: anchor.amount, tier: anchor.tierId });
    }
  }, [anchor.amount, anchor.tierId]);

  const setAmountClamped = useCallback((n: number) => {
    const next = Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, Math.round(n)));
    setAmount(next);
    track("pricing_amount_changed", { amount: next });
  }, []);

  // Wheel to change amount inside the scroller
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 5 : -5;
      setAmountClamped(amount + delta);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [amount, setAmountClamped]);

  // Drag to change amount (mouse + touch)
  const dragStartRef = useRef<{ y: number; startAmount: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartRef.current = { y: e.clientY, startAmount: amount };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dy = dragStartRef.current.y - e.clientY;
    const next = dragStartRef.current.startAmount + Math.round(dy * 0.75);
    setAmountClamped(next);
  };
  const onPointerUp = () => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    // Snap to nearest anchor on release
    const snap = nearestAnchor(amount).amount;
    setAmount(snap);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp")   { e.preventDefault(); setAmountClamped(amount + 5); }
    if (e.key === "ArrowDown") { e.preventDefault(); setAmountClamped(amount - 5); }
    if (e.key === "PageUp")    { e.preventDefault(); setAmountClamped(amount + 25); }
    if (e.key === "PageDown")  { e.preventDefault(); setAmountClamped(amount - 25); }
    if (e.key === "Home")      { e.preventDefault(); setAmountClamped(MIN_AMOUNT); }
    if (e.key === "End")       { e.preventDefault(); setAmountClamped(MAX_AMOUNT); }
    if (e.key === "Enter")     { e.preventDefault(); handleContinue(); }
  };

  const persistSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      if (anchor.priceId) {
        localStorage.setItem(PENDING_PRICE_KEY, anchor.priceId);
        localStorage.setItem(PENDING_AMOUNT_KEY, String(anchor.amount));
      }
    } catch { /* noop */ }
  }, [anchor]);

  const handleContinue = useCallback(() => {
    persistSelection();
    track("checkout_started", { amount: anchor.amount, tier: anchor.tierId, source: "configurator" });
    if (anchor.tierId === "try_pro") track("try_pro_5_clicked", { source: "configurator" });
    if (anchor.cta === "contact" && anchor.href) {
      window.location.href = anchor.href;
      return;
    }
    if (anchor.priceId) {
      window.location.href = `/unlock?intent=buy&priceId=${encodeURIComponent(anchor.priceId)}&checkout=1`;
    }
  }, [anchor, persistSelection]);

  const isRecommended = anchor.amount === 79;
  const reduced = prefersReducedMotion();

  return (
    <section id="configurator" className="max-w-6xl mx-auto px-6 py-16" aria-labelledby="configurator-heading">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F4A125]/30 bg-[#F4A125]/10 text-xs text-[#F4A125] mb-4 backdrop-blur">
          <Sparkles className="w-3 h-3" /> Choose Your Investment
        </div>
        <h2 id="configurator-heading" className="text-3xl md:text-4xl font-bold">
          Tell us what you want to spend.
        </h2>
        <p className="mt-3 text-[#B6BCC8] max-w-2xl mx-auto">
          We'll show you the strongest Obsidian setup available at that level. Scroll, drag, or use your arrow keys.
        </p>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-6 items-stretch">
        {/* Scroller */}
        <div className="glass rounded-3xl p-6 flex flex-col items-center justify-between relative overflow-hidden">
          <div className="text-xs uppercase tracking-widest text-[#B6BCC8]">Monthly investment</div>

          <div
            ref={scrollerRef}
            role="slider"
            aria-label="Monthly investment amount"
            aria-valuemin={MIN_AMOUNT}
            aria-valuemax={MAX_AMOUNT}
            aria-valuenow={amount}
            aria-valuetext={`$${amount} — ${anchor.tier?.name ?? anchor.label}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative my-6 w-full h-56 cursor-grab active:cursor-grabbing select-none touch-none flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#F4A125]/40 rounded-2xl"
          >
            {/* Anchor ticks */}
            <div className="absolute left-4 top-0 bottom-0 flex flex-col justify-between text-[10px] text-[#8b93a1]">
              {[500, 299, 79, 29, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountClamped(v)}
                  className={`px-1 py-0.5 rounded transition ${anchor.amount === v ? "text-[#F4A125]" : "hover:text-white"}`}
                  aria-label={`Snap to $${v}`}
                >
                  ${v}
                </button>
              ))}
            </div>
            <div
              className="text-center"
              style={{
                transition: reduced ? "none" : "transform 240ms cubic-bezier(.2,.9,.2,1)",
                transform: `translateY(${(DEFAULT_AMOUNT - amount) * 0.1}px)`,
              }}
            >
              <div className="text-6xl md:text-7xl font-bold gold-text tabular-nums">
                ${amount}
              </div>
              <div className="mt-2 text-xs uppercase tracking-widest text-[#B6BCC8]">
                {anchor.tierId === "try_pro" ? "one-time · 7 days" : anchor.cta === "contact" ? "custom" : "per month"}
              </div>
              <div className="mt-3 text-sm text-white/90 font-medium">
                Best available: <span className="text-[#F4A125]">{anchor.tier?.name ?? "Enterprise"}</span>
              </div>
            </div>
            {/* Center guide line */}
            <div aria-hidden className="absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-[#F4A125]/40 to-transparent" />
          </div>

          {/* Accessible fallback: standard range slider */}
          <label className="w-full text-xs text-[#B6BCC8] flex flex-col gap-2">
            <span className="sr-only">Investment amount (slider fallback)</span>
            <input
              type="range"
              min={MIN_AMOUNT}
              max={MAX_AMOUNT}
              step={1}
              value={amount}
              onChange={(e) => setAmountClamped(Number(e.target.value))}
              className="w-full accent-[#F4A125]"
              aria-label="Investment amount"
            />
            <div className="flex justify-between text-[10px] text-[#8b93a1]">
              <span>$5</span><span>$79</span><span>$299</span><span>$500+</span>
            </div>
          </label>

          <button
            type="button"
            onClick={handleContinue}
            className={`cta-glow mt-4 w-full px-5 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
              isRecommended
                ? "bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black hover:opacity-95"
                : "bg-white/10 text-white hover:bg-white/15 border border-white/15"
            }`}
          >
            {anchor.cta === "contact" ? "Contact sales" : anchor.tierId === "try_pro" ? "Try Pro for $5" : `Continue with ${anchor.tier?.name}`}
            <ArrowRight className="w-4 h-4" />
          </button>
          {anchor.tierId === "try_pro" && (
            <p className="mt-2 text-[11px] text-[#B6BCC8] text-center">
              Your $5 is credited toward Creator if you upgrade during the trial.
            </p>
          )}
        </div>

        {/* Live feature reveal */}
        <div className="glass rounded-3xl p-6 md:p-8">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h3 className="text-2xl font-bold">
              {anchor.tier?.name ?? "Enterprise"} <span className="text-[#B6BCC8] text-base font-normal">— {anchor.tier?.headline ?? "Custom AI engineering, security, and support."}</span>
            </h3>
            {isRecommended && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#F4A125]/15 text-[#F4A125] border border-[#F4A125]/30">
                Recommended
              </span>
            )}
          </div>
          <ul className="mt-6 grid sm:grid-cols-2 gap-y-2 gap-x-6">
            {FEATURES.map((f) => {
              const unlocked = amount >= f.min;
              return (
                <li
                  key={f.label}
                  className={`flex items-start gap-2 text-sm transition-opacity ${unlocked ? "text-white opacity-100" : "text-[#8b93a1] opacity-60"}`}
                  style={reduced ? undefined : { transition: "opacity 240ms ease" }}
                >
                  {unlocked ? (
                    <Check className="w-4 h-4 mt-0.5 text-[#F4A125] shrink-0" aria-hidden />
                  ) : (
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  )}
                  <span>
                    {f.label}
                    {f.soon && <span className="ml-2 text-[10px] uppercase tracking-widest text-[#B6BCC8]">Coming soon</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Standard plan cards synced with scroller */}
      <div className="mt-12">
        <p className="text-center text-xs uppercase tracking-widest text-[#B6BCC8] mb-6">Or pick a plan directly</p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {ANCHORS.map((a) => {
            const active = a.amount === anchor.amount;
            return (
              <button
                key={a.amount}
                type="button"
                onClick={() => {
                  setAmount(a.amount);
                  track("standard_plan_card_selected", { amount: a.amount, tier: a.tierId });
                }}
                className={`glass glass-hover rounded-2xl p-4 text-left transition ${
                  active ? "ring-2 ring-[#F4A125]/60" : ""
                }`}
                aria-pressed={active}
              >
                <div className="text-xs text-[#B6BCC8]">{a.tier?.name ?? "Enterprise"}</div>
                <div className="mt-1 text-xl font-bold">
                  {a.amount === 500 ? "Custom" : `$${a.amount}`}
                </div>
                <div className="text-[10px] text-[#8b93a1] mt-1">
                  {a.tierId === "try_pro" ? "one-time" : a.cta === "contact" ? "annual" : "per month"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-[#8b93a1]">
        Displayed amounts map to defined plans. Existing subscribers keep their current plan and pricing.
      </p>
    </section>
  );
}

/** Convenience export: read persisted selection on the /unlock page. */
export function readPendingSelection(): { priceId: string | null; amount: number | null } {
  if (typeof window === "undefined") return { priceId: null, amount: null };
  try {
    const priceId = localStorage.getItem(PENDING_PRICE_KEY);
    const amountRaw = localStorage.getItem(PENDING_AMOUNT_KEY);
    return { priceId, amount: amountRaw ? Number(amountRaw) : null };
  } catch { return { priceId: null, amount: null }; }
}
