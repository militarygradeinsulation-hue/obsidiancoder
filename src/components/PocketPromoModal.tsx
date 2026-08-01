import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import pocketShot from "@/assets/workspace-pocket.png.asset.json";
import {
  POCKET_PROMO,
  emitPromoEvent,
  isPromoEligible,
  readPromoState,
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
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
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
      restoreFocusRef.current?.focus?.();
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="pocket-promo-backdrop"
      onMouseDown={(e) => {
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
            <img
              src={pocketShot.url}
              alt="Obsidian Pocket workspace: one prompt box beside a live preview of the generated app"
              loading="lazy"
              width={1200}
              height={750}
            />
          </div>

          <div className="pocket-promo-copy">
            <p className="pocket-promo-eyebrow">{campaign.eyebrow}</p>
            <h2 id="pocket-promo-title" className="pocket-promo-title">
              {campaign.headline}
            </h2>
            <p id="pocket-promo-body" className="pocket-promo-body">
              {campaign.body}
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
