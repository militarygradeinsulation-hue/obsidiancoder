// "Choose Your Investment" — premium horizontal slider.
// Full-width track, draggable handle, snaps to tier anchors, live-updates
// the price, glow, plan name, and feature cards.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  { amount: 5,   tierId: "try_pro",      label: "Try Pro (7-day trial)", priceId: TRY_PRO_PRICE_ID, cta: "checkout" },
  { amount: 29,  tierId: "starter",      label: "Starter",                priceId: "obsidian_starter_monthly", cta: "checkout" },
  { amount: 79,  tierId: "creator",      label: "Creator",                priceId: "obsidian_creator_monthly", cta: "checkout" },
  { amount: 149, tierId: "professional", label: "Professional",           priceId: "obsidian_professional_monthly", cta: "checkout" },
  { amount: 299, tierId: "business",     label: "Business",               priceId: "obsidian_business_monthly", cta: "checkout" },
  { amount: 499, tierId: "elite",        label: "Elite",                  priceId: "obsidian_elite_monthly", cta: "checkout" },
  { amount: 500, tierId: "enterprise",   label: "Enterprise",             cta: "contact", href: "mailto:sales@obsidianvibe.live?subject=Enterprise%20inquiry" },
].map((a) => ({ ...a, tier: PLAN_TIERS.find((t) => t.id === a.tierId) })) as Anchor[];

interface Feature { label: string; min: number; soon?: boolean }
const FEATURES: Feature[] = [
  { label: "Best default AI model",       min: 5 },
  { label: "1 premium project (7 days)",  min: 5 },
  { label: "Deploy & share",              min: 5 },
  { label: "Unlimited builds",            min: 79 },
  { label: "Permanent save",              min: 79 },
  { label: "Premium model access",        min: 79 },
  { label: "Exports (HTML / ZIP)",        min: 79 },
  { label: "Auth & database",             min: 79 },
  { label: "Higher usage limits",         min: 149 },
  { label: "API integrations",            min: 149 },
  { label: "Priority support",            min: 149 },
  { label: "Team seats",                  min: 299, soon: true },
  { label: "White-label / client work",   min: 299, soon: true },
  { label: "Custom domains",              min: 299 },
  { label: "Version history",             min: 299, soon: true },
  { label: "Maximum AI capacity",         min: 499 },
  { label: "Fastest generation queue",    min: 499 },
  { label: "Dedicated success partner",   min: 500 },
  { label: "SSO, SCIM, RBAC",             min: 500, soon: true },
  { label: "Custom SLAs & procurement",   min: 500 },
];

const MIN_AMOUNT = 5;
const MAX_AMOUNT = 500;
const DEFAULT_AMOUNT = 79;
const PENDING_PRICE_KEY = "obs:pending_priceId";
const PENDING_AMOUNT_KEY = "obs:pending_amount";
const SNAP_DISTANCE = 12; // px pull toward nearest anchor while dragging

function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Map amount ↔ track position with a curve that gives lower prices more
// horizontal room (so $5→$79 feels navigable, not crushed).
function amountToPct(amount: number): number {
  const t = (amount - MIN_AMOUNT) / (MAX_AMOUNT - MIN_AMOUNT);
  return Math.pow(Math.max(0, Math.min(1, t)), 0.55) * 100;
}
function pctToAmount(pct: number): number {
  const t = Math.pow(Math.max(0, Math.min(100, pct)) / 100, 1 / 0.55);
  return MIN_AMOUNT + t * (MAX_AMOUNT - MIN_AMOUNT);
}

function nearestAnchor(amount: number): Anchor {
  return ANCHORS.reduce(
    (best, a) => (Math.abs(a.amount - amount) < Math.abs(best.amount - amount) ? a : best),
    ANCHORS[0],
  );
}

export function PricingConfigurator() {
  const [amount, setAmount] = useState<number>(DEFAULT_AMOUNT);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const lastAnchorRef = useRef<number>(DEFAULT_AMOUNT);

  const anchor = useMemo(() => nearestAnchor(amount), [amount]);
  const pct = amountToPct(amount);
  const anchorPct = amountToPct(anchor.amount);
  const isRecommended = anchor.amount === 79;

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

  const applyAmount = useCallback((n: number) => {
    const next = Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, Math.round(n)));
    setAmount((prev) => {
      if (prev !== next) track("pricing_amount_changed", { amount: next });
      return next;
    });
  }, []);

  // Convert a clientX on the track → amount, applying a subtle magnetic pull
  // to nearest anchor so the drag feels weighted toward real plans.
  const setFromClientX = useCallback((clientX: number, snap: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rawPct = ((clientX - rect.left) / rect.width) * 100;
    let value = pctToAmount(rawPct);
    const near = nearestAnchor(value);
    const nearPct = amountToPct(near.amount);
    const dxPct = nearPct - rawPct;
    const dxPx = (dxPct / 100) * rect.width;
    if (snap) {
      value = near.amount;
    } else if (Math.abs(dxPx) < SNAP_DISTANCE) {
      // Magnetic pull — bias 45% toward anchor within snap distance.
      const biasedPct = rawPct + dxPct * 0.45;
      value = pctToAmount(biasedPct);
    }
    applyAmount(value);
  }, [applyAmount]);

  // Pointer events
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX, false);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setFromClientX(e.clientX, false);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    setFromClientX(e.clientX, true); // snap on release
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = ANCHORS.findIndex((a) => a.amount === anchor.amount);
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = ANCHORS[Math.min(ANCHORS.length - 1, idx + 1)];
      applyAmount(next.amount);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = ANCHORS[Math.max(0, idx - 1)];
      applyAmount(next.amount);
    } else if (e.key === "Home") {
      e.preventDefault();
      applyAmount(MIN_AMOUNT);
    } else if (e.key === "End") {
      e.preventDefault();
      applyAmount(MAX_AMOUNT);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleContinue();
    }
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

  const reduced = reducedMotion();
  const transition = reduced || dragging ? "none" : "left 320ms cubic-bezier(.2,.9,.2,1)";

  return (
    <section id="configurator" className="max-w-6xl mx-auto px-6 py-20" aria-labelledby="configurator-heading">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F4A125]/30 bg-[#F4A125]/10 text-xs text-[#F4A125] mb-4 backdrop-blur">
          <Sparkles className="w-3 h-3" /> Choose Your Investment
        </div>
        <h2 id="configurator-heading" className="text-3xl md:text-5xl font-bold tracking-tight">
          Slide to configure your <span className="gold-text">Obsidian</span>.
        </h2>
        <p className="mt-3 text-[#B6BCC8] max-w-2xl mx-auto">
          Drag the handle across the track. The plan, features, and price update instantly.
        </p>
      </div>

      {/* Live price display */}
      <div className="relative text-center mb-10 min-h-[140px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{
            background: `radial-gradient(600px 200px at 50% 50%, rgba(244,161,37,${0.14 + (amount / MAX_AMOUNT) * 0.28}) 0%, transparent 70%)`,
            transition: reduced ? "none" : "background 320ms ease",
          }}
        />
        <div className="relative">
          <div
            className="text-7xl md:text-8xl font-bold gold-text tabular-nums leading-none"
            style={{
              textShadow: `0 0 ${20 + (amount / MAX_AMOUNT) * 60}px rgba(244,161,37,${0.35 + (amount / MAX_AMOUNT) * 0.4})`,
              transition: reduced ? "none" : "text-shadow 240ms ease",
            }}
          >
            {anchor.tierId === "enterprise" ? "Custom" : `$${amount}`}
          </div>
          <div className="mt-3 text-xs uppercase tracking-[0.3em] text-[#B6BCC8]">
            {anchor.tierId === "try_pro" ? "one-time · 7 days"
              : anchor.tierId === "enterprise" ? "annual · custom terms"
              : "per month"}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-lg">
            <span className="font-semibold text-white">{anchor.tier?.name ?? "Enterprise"}</span>
            {isRecommended && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#F4A125]/15 text-[#F4A125] border border-[#F4A125]/30">
                Recommended
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-[#B6BCC8] max-w-xl mx-auto min-h-[1.5em]">
            {anchor.tier?.headline ?? "Custom AI engineering, security, and support."}
          </p>
        </div>
      </div>

      {/* Horizontal slider */}
      <div className="relative px-6 md:px-10 pt-6 pb-10">
        <div
          ref={trackRef}
          role="slider"
          aria-label="Monthly investment amount"
          aria-valuemin={MIN_AMOUNT}
          aria-valuemax={MAX_AMOUNT}
          aria-valuenow={amount}
          aria-valuetext={`$${amount} — ${anchor.tier?.name ?? "Enterprise"}`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="relative h-14 cursor-grab active:cursor-grabbing touch-none select-none focus:outline-none"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {/* Base track */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-white/10 border border-white/10 shadow-inner" />
          {/* Filled portion */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-2 rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, rgba(244,161,37,0.35) 0%, #F4A125 60%, #DD9324 100%)",
              boxShadow: "0 0 24px rgba(244,161,37,0.45)",
              transition,
            }}
          />
          {/* Anchor ticks */}
          {ANCHORS.map((a) => {
            const p = amountToPct(a.amount);
            const active = a.amount === anchor.amount;
            return (
              <button
                key={a.amount}
                type="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); applyAmount(a.amount); }}
                aria-label={`Snap to ${a.tier?.name ?? "Enterprise"} (${a.amount === 500 ? "custom" : "$" + a.amount})`}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group"
                style={{ left: `${p}%` }}
              >
                <span
                  className={`block rounded-full border transition-all ${
                    active
                      ? "w-3.5 h-3.5 bg-[#F4A125] border-[#F4A125] shadow-[0_0_12px_rgba(244,161,37,0.9)]"
                      : "w-2.5 h-2.5 bg-white/20 border-white/30 group-hover:bg-white/40"
                  }`}
                />
                <span
                  className={`absolute top-6 text-[10px] uppercase tracking-widest whitespace-nowrap ${
                    active ? "text-[#F4A125]" : "text-[#8b93a1] group-hover:text-white/80"
                  }`}
                >
                  {a.amount === 500 ? "Enterprise" : `$${a.amount}`}
                </span>
              </button>
            );
          })}
          {/* Handle */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pct}%`, transition }}
          >
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-0 -m-4 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(244,161,37,0.55) 0%, transparent 70%)",
                  filter: dragging ? "blur(6px)" : "blur(4px)",
                  transform: dragging ? "scale(1.4)" : "scale(1)",
                  transition: reduced ? "none" : "transform 200ms ease, filter 200ms ease",
                }}
              />
              <span
                className="relative block w-8 h-8 rounded-full border-2 border-[#F4A125] bg-black shadow-[0_6px_24px_rgba(244,161,37,0.6),inset_0_0_0_2px_rgba(0,0,0,0.6)]"
                style={{
                  transform: dragging ? "scale(1.1)" : "scale(1)",
                  transition: reduced ? "none" : "transform 160ms ease",
                }}
              />
              <span
                className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-[#F4A125] pointer-events-none"
                style={{ boxShadow: "0 0 12px rgba(244,161,37,0.9)" }}
              />
            </div>
          </div>
          {/* Snapped-anchor pulse indicator */}
          {!dragging && Math.abs(pct - anchorPct) < 0.5 && (
            <div
              aria-hidden
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${anchorPct}%` }}
            >
              <span
                className="block w-10 h-10 rounded-full border border-[#F4A125]/40"
                style={{ animation: reduced ? undefined : "ping 1.6s cubic-bezier(0,0,0.2,1) infinite" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleContinue}
          className={`cta-glow px-8 py-4 rounded-2xl text-base font-semibold flex items-center gap-2 transition-all ${
            isRecommended || anchor.tierId === "try_pro"
              ? "bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black hover:opacity-95"
              : "bg-white/10 text-white hover:bg-white/15 border border-white/15"
          }`}
          style={{ boxShadow: isRecommended ? "0 12px 40px rgba(244,161,37,0.35)" : undefined }}
        >
          {anchor.cta === "contact" ? "Contact sales"
            : anchor.tierId === "try_pro" ? "Try Pro for $5"
            : `Continue with ${anchor.tier?.name}`}
          <ArrowRight className="w-4 h-4" />
        </button>
        {anchor.tierId === "try_pro" && (
          <p className="text-[11px] text-[#B6BCC8]">
            Your $5 is credited toward Creator if you upgrade during the trial.
          </p>
        )}
      </div>

      {/* Feature cards */}
      <div className="mt-16">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-[#B6BCC8] mb-6">What unlocks at this level</p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f) => {
            const unlocked = amount >= f.min;
            return (
              <li
                key={f.label}
                className={`glass rounded-2xl p-4 flex items-start gap-3 transition-all ${
                  unlocked ? "opacity-100 border-[#F4A125]/25" : "opacity-55"
                }`}
                style={{
                  transition: reduced ? "none" : "opacity 260ms ease, transform 260ms ease, border-color 260ms ease",
                  transform: unlocked ? "translateY(0)" : "translateY(2px)",
                }}
              >
                <span
                  className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border ${
                    unlocked
                      ? "bg-[#F4A125]/15 border-[#F4A125]/40 text-[#F4A125]"
                      : "bg-white/5 border-white/10 text-[#8b93a1]"
                  }`}
                  style={{
                    boxShadow: unlocked ? "0 0 16px rgba(244,161,37,0.35)" : undefined,
                    transition: reduced ? "none" : "box-shadow 260ms ease",
                  }}
                >
                  {unlocked ? <Check className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${unlocked ? "text-white" : "text-[#B6BCC8]"}`}>
                    {f.label}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-[#8b93a1] mt-0.5">
                    {f.soon ? "Coming soon" : unlocked ? "Unlocked" : `Unlocks at $${f.min}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-8 text-center text-[11px] text-[#8b93a1]">
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
