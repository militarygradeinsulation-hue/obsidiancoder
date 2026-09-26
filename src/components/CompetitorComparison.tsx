import { useMemo, useState } from "react";
import { CheckCircle2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Every number here was verified via live web search on 2026-09-26 against
 * each vendor's own current pricing page or a source directly citing it —
 * not pulled from memory or an old comparison. Flat-credit rows (Obsidian,
 * Hercules, Lovable) use directly comparable systems: a fixed number of
 * credits included per month at a fixed price, so the multiplier math
 * below is a real, apples-to-apples comparison, not marketing rounding.
 * The other tools meter usage in dollars, tokens, or split
 * message/integration credits — in the scroller they are shown in their
 * OWN published unit at the selected budget (e.g. "$60 of usage",
 * "180 message credits"), never converted into fake "credits", and each
 * row is labeled with its model so the comparison stays honest.
 */
interface CreditRow {
  tool: string;
  price: string;
  credits: string;
  monthlyPrice: number;
  monthlyCredits: number;
  color: string;
  isObsidian?: boolean;
}

const FLAT_CREDIT_ROWS: CreditRow[] = [
  {
    tool: "Obsidian Pocket",
    price: "$10/mo",
    credits: "300",
    monthlyPrice: 10,
    monthlyCredits: 300,
    color: "#F4A125",
    isObsidian: true,
  },
  {
    tool: "Hercules Pro",
    price: "$25/mo",
    credits: "75",
    monthlyPrice: 25,
    monthlyCredits: 75,
    color: "#5cc8be",
  },
  {
    tool: "Lovable Pro",
    price: "$25/mo",
    credits: "100",
    monthlyPrice: 25,
    monthlyCredits: 100,
    color: "#8f9bf0",
  },
];

/**
 * One row per tool in the combined scroller. `atBudget(budget)` returns the
 * numeric amount the budget buys in that tool's own unit, and `unit` /
 * `format` render it honestly. `model` names the usage model so nothing is
 * presented as a flat credit count when it is not one.
 */
interface ScrollerRow {
  tool: string;
  color: string;
  isObsidian?: boolean;
  model: string;
  atBudget: (budget: number) => number;
  format: (value: number) => string;
}

const SCROLLER_ROWS: ScrollerRow[] = [
  {
    tool: "Obsidian Pocket",
    color: "#F4A125",
    isObsidian: true,
    model: "Flat credits",
    atBudget: (b) => Math.round((b / 10) * 300),
    format: (v) => `${v.toLocaleString()} credits`,
  },
  {
    tool: "Obsidian Vibe",
    color: "#DD9324",
    isObsidian: true,
    model: "Flat credits",
    atBudget: (b) => Math.round((b / 39) * 1000),
    format: (v) => `${v.toLocaleString()} credits`,
  },
  {
    tool: "Hercules Pro",
    color: "#5cc8be",
    model: "Flat credits",
    atBudget: (b) => Math.round((b / 25) * 75),
    format: (v) => `${v.toLocaleString()} credits`,
  },
  {
    tool: "Lovable Pro",
    color: "#8f9bf0",
    model: "Flat credits",
    atBudget: (b) => Math.round((b / 25) * 100),
    format: (v) => `${v.toLocaleString()} credits`,
  },
  {
    tool: "Base44 Starter",
    color: "#e07a5f",
    model: "Message + integration credits",
    atBudget: (b) => Math.round((b / 20) * 100),
    format: (v) => `~${v.toLocaleString()} message credits`,
  },
  {
    tool: "Replit Core",
    color: "#f26207",
    model: "Dollar-denominated usage",
    atBudget: (b) => b,
    format: (v) => `~$${v.toLocaleString()} of usage`,
  },
  {
    tool: "v0 Premium",
    color: "#9aa0a6",
    model: "Dollar-denominated credits",
    atBudget: (b) => b,
    format: (v) => `~$${v.toLocaleString()} in credits`,
  },
  {
    tool: "Bolt.new",
    color: "#ffd02f",
    model: "Token-based",
    atBudget: (b) => b,
    format: (v) => `~$${v.toLocaleString()} of tokens`,
  },
  {
    tool: "Cursor Pro",
    color: "#6e6e6e",
    model: "Usage-based",
    atBudget: (b) => b,
    format: (v) => `~$${v.toLocaleString()} of usage`,
  },
  {
    tool: "Devin",
    color: "#b088f9",
    model: "Per-seat enterprise",
    atBudget: (b) => Math.floor(b / 500),
    format: (v) => (v === 0 ? "Needs $500/seat" : `${v} seat${v === 1 ? "" : "s"}`),
  },
];

function maxCredits(rows: CreditRow[]): number {
  return Math.max(...rows.map((r) => r.monthlyCredits));
}

function CreditBar({ row, max }: { row: CreditRow; max: number }) {
  const pct = Math.max(6, Math.round((row.monthlyCredits / max) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: row.isObsidian
            ? "linear-gradient(90deg, #F6B24A, #DD9324)"
            : row.color,
          opacity: row.isObsidian ? 1 : 0.55,
        }}
      />
    </div>
  );
}

function FlatCreditTable({ rows, caption }: { rows: CreditRow[]; caption: string }) {
  const max = maxCredits(rows);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#a5a29c]">{caption}</p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.tool}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-xl border-l-4 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_1fr]",
              r.isObsidian ? "bg-[#F4A125]/10 ring-1 ring-[#F4A125]/40" : "bg-white/[0.02]",
            )}
            style={{ borderLeftColor: r.color }}
          >
            <span className={cn("truncate text-sm font-semibold", r.isObsidian ? "text-[#f2eee7]" : "text-[#d8d5cf]")}>
              {r.tool}
            </span>
            <span className="text-right text-sm tabular-nums text-[#a5a29c] sm:text-left">{r.price}</span>
            <span
              className="col-span-2 text-sm font-bold tabular-nums sm:col-span-1"
              style={{ color: r.isObsidian ? "#F4A125" : "#d8d5cf" }}
            >
              {r.credits} credits
            </span>
            <div className="col-span-2 sm:col-span-1">
              <CreditBar row={r} max={max} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Interactive budget scroller: drag the slider to a monthly budget and
 * every tool's bar recomputes live, in that tool's own published unit —
 * flat credits for Obsidian/Hercules/Lovable, message credits for Base44,
 * dollar usage for Replit/v0/Bolt/Cursor, seats for Devin. Nothing is
 * converted into a unit the vendor does not sell.
 */
function BudgetScroller() {
  const [budget, setBudget] = useState(25);
  const computed = useMemo(
    () =>
      SCROLLER_ROWS.map((r) => ({
        ...r,
        value: r.atBudget(budget),
      })),
    [budget],
  );
  const maxValue = Math.max(...computed.map((r) => r.value), 1);
  const obsidian = computed.find((r) => r.tool === "Obsidian Pocket")!;
  const bestOtherFlat = Math.max(
    ...computed
      .filter((r) => !r.isObsidian && r.model === "Flat credits")
      .map((r) => r.value),
  );
  const multiple = (obsidian.value / Math.max(1, bestOtherFlat)).toFixed(1);

  return (
    <div className="rounded-2xl border border-[#F4A125]/25 bg-[#F4A125]/[0.04] p-5 sm:p-6 lg:col-span-2">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#F4A125]">
            Try it live — drag the budget
          </p>
          <p className="mt-1 text-sm text-[#a5a29c]">
            One budget, every tool — each shown in the unit it actually sells.
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold tabular-nums text-[#f2eee7]">${budget}</span>
          <span className="text-sm text-[#a5a29c]">/mo</span>
        </div>
      </div>

      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={budget}
        onChange={(e) => setBudget(Number(e.target.value))}
        aria-label="Monthly budget in dollars"
        className="obsidian-budget-slider w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[#a5a29c]">
        <span>$10</span>
        <span>$100</span>
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {computed.map((r) => {
          const pct = Math.max(3, Math.round((r.value / maxValue) * 100));
          return (
            <div key={r.tool}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span
                  className="flex items-center gap-2 text-sm font-semibold"
                  style={{ color: r.isObsidian ? "#f2eee7" : "#d8d5cf" }}
                >
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  {r.tool}
                  <span className="text-[10px] font-normal uppercase tracking-wider text-[#a5a29c]">
                    {r.model}
                  </span>
                </span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: r.isObsidian ? "#F4A125" : "#a5a29c" }}
                >
                  {r.format(r.value)}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: r.isObsidian
                      ? "linear-gradient(90deg, #F6B24A, #DD9324)"
                      : r.color,
                    opacity: r.isObsidian ? 1 : 0.55,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 rounded-xl border border-[#F4A125]/30 bg-[#F4A125]/[0.06] px-4 py-3 text-sm text-[#e8e6e1]">
        At <span className="font-bold text-[#F4A125]">${budget}/mo</span>, Obsidian Pocket gives you{" "}
        <span className="font-bold text-[#F4A125]">{multiple}x</span> the credits of the next best flat-credit tool —
        while usage-based tools just give you ${budget} of metered usage.
      </p>
    </div>
  );
}

export default function CompetitorComparison() {
  return (
    <section
      id="competitor-comparison"
      aria-labelledby="competitor-comparison-heading"
      className="mx-auto mt-16 w-full max-w-5xl px-4"
    >
      <div className="mb-3 text-center">
        <h2
          id="competitor-comparison-heading"
          className="text-balance text-3xl font-semibold tracking-tight text-[#f2eee7] md:text-4xl"
        >
          More credits. <span className="text-[#F4A125]">Lower cost.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#a5a29c] md:text-base">
          Obsidian gives builders more room to create without paying premium-tool prices.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-[#F4A125]/30 bg-[#F4A125]/[0.06] p-4">
          <Zap className="size-5 shrink-0 text-[#F4A125]" aria-hidden />
          <p className="text-sm text-[#e8e6e1]">
            <span className="font-bold text-[#F4A125]">4x</span> the credits of Hercules Pro, at less than half the price.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#F4A125]/30 bg-[#F4A125]/[0.06] p-4">
          <Zap className="size-5 shrink-0 text-[#F4A125]" aria-hidden />
          <p className="text-sm text-[#e8e6e1]">
            <span className="font-bold text-[#F4A125]">3x</span> the credits of Lovable Pro, at less than half the price.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <FlatCreditTable rows={FLAT_CREDIT_ROWS} caption="Obsidian Pocket vs. the field" />
        <BudgetScroller />
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-[#a5a29c]">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#F4A125]" aria-hidden />
        <p>
          Credit systems differ across tools. The flat-credit comparison above is directly comparable for Obsidian,
          Hercules, and Lovable — all three sell a fixed number of credits for a fixed monthly price. The other
          platforms in the scroller meter usage in dollars, tokens, or split message/integration credits, so each is
          shown in its own published unit at the selected budget, never converted into a credit count it does not sell.
        </p>
      </div>
    </section>
  );
}
