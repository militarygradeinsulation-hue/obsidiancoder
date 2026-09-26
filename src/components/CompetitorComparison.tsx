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
 * Everything below that line uses a materially different usage model
 * (message + integration splits, dollar-denominated usage, tokens, or
 * flat per-seat enterprise pricing) and is labeled as such rather than
 * forced into the same comparison — a $20/mo "usage-based" tier and a
 * $20/mo flat-credit tier are not the same kind of number, and presenting
 * them as if they were would be the kind of claim this file is deliberately
 * avoiding.
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

const OTHER_MARKET_ROWS = [
  { tool: "Base44 Starter", price: "$20/mo", usage: "100 message + 2,000 integration credits" },
  { tool: "Base44 Builder", price: "$50/mo", usage: "250 message + 10,000 integration credits" },
  { tool: "Replit Core", price: "$20/mo", usage: "~$25 worth of usage" },
  { tool: "Replit Pro", price: "~$100/mo", usage: "~$100 worth of usage, up to 15 builders" },
  { tool: "v0 Free", price: "$0", usage: "$5/mo in credits" },
  { tool: "v0 Premium", price: "$20/mo", usage: "$20/mo in credits" },
  { tool: "v0 Team", price: "$30/user/mo", usage: "$30/mo in credits + $2 daily" },
  { tool: "Bolt.new", price: "~$20–25/mo", usage: "Token-based, not a flat credit count" },
  { tool: "Cursor Pro", price: "$20/mo", usage: "Usage-based" },
  { tool: "Cursor Pro+", price: "$60/mo", usage: "Usage-based" },
  { tool: "Cursor Ultra", price: "$200/mo", usage: "Usage-based" },
  { tool: "Devin", price: "~$500/seat/mo", usage: "Enterprise / engineering-team pricing" },
] as const;

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
 * Interactive budget scroller: drag the slider to a monthly budget and the
 * bars recompute live, showing how many flat credits each tool gives you at
 * that spend (credits scale linearly with the vendor's published $/credit).
 */
function BudgetScroller() {
  const [budget, setBudget] = useState(25);
  const computed = useMemo(
    () =>
      FLAT_CREDIT_ROWS.map((r) => ({
        ...r,
        atBudget: Math.round((budget / r.monthlyPrice) * r.monthlyCredits),
      })),
    [budget],
  );
  const maxAtBudget = Math.max(...computed.map((r) => r.atBudget));
  const obsidian = computed.find((r) => r.isObsidian)!;
  const bestOther = Math.max(...computed.filter((r) => !r.isObsidian).map((r) => r.atBudget));
  const multiple = (obsidian.atBudget / Math.max(1, bestOther)).toFixed(1);

  return (
    <div className="rounded-2xl border border-[#F4A125]/25 bg-[#F4A125]/[0.04] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#F4A125]">
            Try it live — drag the budget
          </p>
          <p className="mt-1 text-sm text-[#a5a29c]">
            See how many credits each tool gives you for the same money.
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

      <div className="mt-5 space-y-4">
        {computed.map((r) => {
          const pct = Math.max(4, Math.round((r.atBudget / maxAtBudget) * 100));
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
                </span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: r.isObsidian ? "#F4A125" : "#a5a29c" }}
                >
                  {r.atBudget.toLocaleString()} credits
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
        <span className="font-bold text-[#F4A125]">{multiple}x</span> the credits of the next best flat-credit tool.
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

      <div className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-[#f2eee7]">Other market pricing, for context</h3>
          <p className="text-xs text-[#a5a29c]">Different usage models — not a direct 1:1 credit comparison.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-widest text-[#a5a29c]">
                <th scope="col" className="px-4 py-3 font-semibold">Tool</th>
                <th scope="col" className="px-4 py-3 font-semibold">Monthly price</th>
                <th scope="col" className="px-4 py-3 font-semibold">Credits / usage model</th>
              </tr>
            </thead>
            <tbody>
              {OTHER_MARKET_ROWS.map((r) => (
                <tr key={r.tool} className="border-b border-white/5 last:border-0">
                  <td className="border-l-2 border-white/15 px-4 py-3 font-medium text-[#d8d5cf]">{r.tool}</td>
                  <td className="px-4 py-3 tabular-nums text-[#a5a29c]">{r.price}</td>
                  <td className="px-4 py-3 text-[#a5a29c]">{r.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-[#a5a29c]">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#F4A125]" aria-hidden />
        <p>
          Credit systems differ across tools. The flat-credit comparison above is directly comparable for Obsidian,
          Hercules, and Lovable — all three sell a fixed number of credits for a fixed monthly price. Other platforms
          meter usage in dollars, tokens, or split message/integration credits, so their numbers are shown for
          context, not folded into the multiplier claims above.
        </p>
      </div>
    </section>
  );
}
