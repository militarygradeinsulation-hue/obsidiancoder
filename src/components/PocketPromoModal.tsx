import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { POCKET_MONTHLY_CREDITS, POCKET_PROMO_CREDITS, POCKET_PROMO_ENDS_AT } from "@/lib/plans";
import {
  POCKET_PROMO,
  emitPromoEvent,
  isPromoEligible,
  readPromoState,
  shouldForceClosePromo,
  writePromoState,
  type PromoCampaign,
  type PromoDismissSource,
} from "@/lib/pocket-promo";

interface Props {
  /** True while any other modal / panel / expanded surface is open. */
  blocked: boolean;
  sessionLoading: boolean;
  signedIn: boolean;
  search?: { checkout?: string; intent?: string };
  campaign?: PromoCampaign;
}

/** Session-scoped guard so rerenders (and storage failures) cannot reopen it. */
const memoryShown = new Set<string>();
const SESSION_KEY = "obs_pocket_promo_shown_v1";

function markSessionShown(campaignId: string) {
  memoryShown.add(campaignId);
  try {
    sessionStorage.setItem(SESSION_KEY, campaignId);
  } catch {
    /* noop */
  }
}

function wasSessionShown(campaignId: string): boolean {
  if (memoryShown.has(campaignId)) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === campaignId;
  } catch {
    return false;
  }
}

export default function PocketPromoModal({
  blocked,
  sessionLoading,
  signedIn,
  search,
  campaign = POCKET_PROMO,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Depend on primitives only: `search` is a fresh object literal on every
  // parent render, and using it as a dep would reset the open timer forever.
  const searchCheckout = search?.checkout;
  const searchIntent = search?.intent;

  // Eligibility + scheduling. Client-only (runs after mount) so storage/date
  // checks never cause a hydration mismatch.
  useEffect(() => {
    if (open) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    const eligible = isPromoEligible({
      campaign,
      now: Date.now(),
      blocked,
      sessionLoading,
      signedIn,
      search: { checkout: searchCheckout, intent: searchIntent },
      sessionShown: wasSessionShown(campaign.campaignId),
      stored: readPromoState(storage),
    });
    if (!eligible) return;
    const timer = window.setTimeout(() => {
      if (wasSessionShown(campaign.campaignId)) return;
      markSessionShown(campaign.campaignId);
      emitPromoEvent("pocket_promo_impression", campaign.campaignId);
      setOpen(true);
    }, campaign.initialDelayMs);
    return () => window.clearTimeout(timer);
  }, [blocked, sessionLoading, signedIn, searchCheckout, searchIntent, campaign, open]);

  // Safety yield: once open, a higher-priority flow (another dialog/panel, an
  // arriving session, auth redirect, checkout/buy/code intent, or the campaign
  // going out of window) must reclaim the screen immediately. This is NOT a
  // user dismissal — no cooldown timestamp is written and no dismissal event
  // is emitted. The session-shown marker set at open time stays in place, so
  // the promo will not reopen later in this tab.
  useEffect(() => {
    if (!open) return;
    if (
      shouldForceClosePromo({
        campaign,
        now: Date.now(),
        blocked,
        sessionLoading,
        signedIn,
        search: { checkout: searchCheckout, intent: searchIntent },
      })
    ) {
      setOpen(false);
    }
  }, [open, blocked, sessionLoading, signedIn, searchCheckout, searchIntent, campaign]);

  const persist = useCallback(
    (patch: { dismissedAt?: number; engagedAt?: number }) => {
      let storage: Storage | null = null;
      try {
        storage = window.localStorage;
      } catch {
        storage = null;
      }
      const prev = readPromoState(storage);
      writePromoState(storage, {
        campaignId: campaign.campaignId,
        ...(prev && prev.campaignId === campaign.campaignId ? prev : {}),
        ...patch,
      });
    },
    [campaign.campaignId],
  );

  const dismiss = useCallback(
    (source: PromoDismissSource) => {
      setOpen(false);
      persist({ dismissedAt: Date.now() });
      emitPromoEvent("pocket_promo_dismissed", campaign.campaignId, source);
    },
    [campaign.campaignId, persist],
  );

  const engage = useCallback(() => {
    setOpen(false);
    persist({ engagedAt: Date.now() });
    emitPromoEvent("pocket_promo_cta_clicked", campaign.campaignId);
    void router.navigate({ to: campaign.destination });
  }, [campaign.campaignId, campaign.destination, persist, router]);

  // Focus management, scroll lock, Escape, focus trap.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => primaryRef.current?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss("escape");
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      // The previously focused node may have been unmounted (e.g. an auto
      // close triggered by a route/panel change) — never throw on restore.
      const prior = restoreFocusRef.current;
      restoreFocusRef.current = null;
      try {
        if (prior && prior.isConnected) prior.focus?.();
      } catch {
        /* noop */
      }
    };
  }, [open, dismiss]);

  if (!open) return null;
  const promoActive = Date.now() < new Date(POCKET_PROMO_ENDS_AT).getTime();

  return (
    <div
      className="pocket-promo-backdrop"
      onPointerDown={(e) => {
        // Pointer events cover touch, mouse, and pen — onMouseDown alone
        // never fires reliably for finger taps on mobile.
        if (e.target === e.currentTarget) dismiss("backdrop");
      }}
    >
      <div
        ref={dialogRef}
        className="pocket-promo-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pocket-promo-title"
        aria-describedby="pocket-promo-body"
      >
        <button
          type="button"
          className="pocket-promo-close"
          aria-label="Close Obsidian Pocket announcement"
          onClick={() => dismiss("close")}
        >
          ✕
        </button>

        <div className="pocket-promo-grid">
          <div className="pocket-promo-shot">
            <PocketCreditCompare promoActive={promoActive} />
          </div>

          <div className="pocket-promo-copy">
            <p className="pocket-promo-eyebrow">{campaign.eyebrow}</p>
            <h2 id="pocket-promo-title" className="pocket-promo-title">
              {campaign.headline}
            </h2>
            <p id="pocket-promo-body" className="pocket-promo-body">
              {promoActive && campaign.promoBody ? campaign.promoBody : campaign.body}
            </p>

            <div className="pocket-promo-actions">
              <button
                ref={primaryRef}
                type="button"
                className="pocket-promo-primary"
                onClick={engage}
              >
                {campaign.primaryCta}
              </button>
              <button
                type="button"
                className="pocket-promo-secondary"
                onClick={() => dismiss("continue")}
              >
                {campaign.secondaryCta}
              </button>
            </div>

            <p className="pocket-promo-trust">{campaign.trustLine}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Native replacement for the old pricing image, which advertised Obsidian
 * Vibe as a $39 self-serve tier. Pocket-only, same verified flat-credit
 * numbers as CompetitorComparison, and it reflects the live launch offer
 * automatically (reverts to 300 after POCKET_PROMO_ENDS_AT).
 */
function PocketCreditCompare({ promoActive }: { promoActive: boolean }) {
  const pocketCredits = promoActive ? POCKET_PROMO_CREDITS : POCKET_MONTHLY_CREDITS;
  const rows = [
    { name: "Obsidian Pocket", price: "$10/mo", credits: pocketCredits, ours: true },
    { name: "Lovable Pro", price: "$25/mo", credits: 100, ours: false },
    { name: "Hercules Pro", price: "$25/mo", credits: 75, ours: false },
  ];
  const max = Math.max(...rows.map((r) => r.credits));
  return (
    <div
      role="img"
      aria-label={`Obsidian Pocket: ${pocketCredits} credits for $10 a month. Lovable Pro: 100 credits for $25. Hercules Pro: 75 credits for $25.`}
      style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, height: "100%", padding: "32px 28px", background: "radial-gradient(120% 80% at 0% 0%, rgba(244,161,37,0.10), transparent 60%), #0c0d10" }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a5a29c" }}>
        Monthly AI credits{promoActive ? " · launch offer" : ""}
      </div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14 }}>
            <span style={{ fontWeight: 600, color: r.ours ? "#f2eee7" : "#b6b3ad" }}>{r.name}</span>
            <span style={{ color: "#a5a29c", fontVariantNumeric: "tabular-nums" }}>
              {r.price} · <strong style={{ color: r.ours ? "#F4A125" : "#d8d5cf" }}>{r.credits.toLocaleString()}</strong>
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(6, Math.round((r.credits / max) * 100))}%`,
                height: "100%",
                borderRadius: 999,
                background: r.ours ? "linear-gradient(90deg,#F6B24A,#DD9324)" : "rgba(255,255,255,0.22)",
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "#76736d", lineHeight: 1.5 }}>
        Flat-credit plans compared at published monthly prices.
      </div>
    </div>
  );
}
