import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/waitlist")({
  head: () => ({
    meta: [
      { title: "Early Access · Obsidian by Aetheris" },
      { name: "description", content: "Join Obsidian Early Access. Get launch updates and priority invitations to the AI Engineering Operating System." },
      { property: "og:title", content: "Obsidian Early Access" },
      { property: "og:description", content: "Launch updates and priority invitations for the AI Engineering Operating System." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WaitlistPage,
});

const INTEREST = [
  { id: "exploring", label: "Exploring — kicking the tires" },
  { id: "planning", label: "Planning — building toward launch" },
  { id: "ready", label: "Ready — want access as soon as possible" },
  { id: "urgent", label: "Urgent — have a project starting now" },
] as const;

function WaitlistPage() {
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialTier = search?.get("tier") ?? "";
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    intended_use: "",
    interest_level: "planning",
    tier: initialTier,
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "waitlist_page" }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Submission failed (${res.status})`);
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Submission failed");
    }
  }

  return (
    <main className="min-h-screen bg-[#050607] text-[#f2eee7] px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-xs text-[#B6BCC8] hover:text-[#f2eee7]">← Back</Link>
        <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight">Obsidian Early Access</h1>
        <p className="mt-3 text-[#B6BCC8] leading-relaxed">
          Early Access members receive launch updates and priority invitations as new plans and features go live.
          We do not promise discounts — you get access first, and a direct line to the team building this.
        </p>

        {status === "done" ? (
          <div className="mt-8 rounded-xl border border-[#F4A125]/40 bg-white/[0.02] p-6">
            <h2 className="text-lg font-semibold text-[#F4A125]">You're on the list.</h2>
            <p className="mt-2 text-sm text-[#B6BCC8]">
              We'll email <span className="text-[#f2eee7]">{form.email}</span> with launch updates and your invitation when your tier opens.
            </p>
            <Link to="/" className="mt-4 inline-flex px-4 py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-medium">
              Return to Obsidian
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <Field label="Name" required>
              <input required maxLength={200} value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} autoComplete="name" />
            </Field>
            <Field label="Email" required>
              <input required type="email" maxLength={320} value={form.email} onChange={(e) => update("email", e.target.value)} className={inputCls} autoComplete="email" />
            </Field>
            <Field label="Company (optional)">
              <input maxLength={200} value={form.company} onChange={(e) => update("company", e.target.value)} className={inputCls} autoComplete="organization" />
            </Field>
            <Field label="What do you want to build with Obsidian?" required>
              <textarea required maxLength={2000} rows={4} value={form.intended_use} onChange={(e) => update("intended_use", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Interest level" required>
              <select value={form.interest_level} onChange={(e) => update("interest_level", e.target.value)} className={inputCls}>
                {INTEREST.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
            </Field>
            {form.tier && (
              <p className="text-xs text-[#B6BCC8]">Interested tier: <span className="text-[#F4A125]">{form.tier}</span></p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full py-3 rounded-md bg-[#F4A125] hover:bg-[#DD9324] disabled:opacity-50 text-black font-semibold"
            >
              {status === "submitting" ? "Submitting…" : "Join Early Access"}
            </button>
            <p className="text-[11px] text-[#B6BCC8] opacity-70 text-center">
              By joining, you agree to receive launch and product emails from Aetheris. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

const inputCls = "w-full px-3 py-2 rounded-md bg-white/[0.03] border border-white/10 focus:border-[#F4A125]/60 focus:outline-none text-sm text-[#f2eee7] placeholder:text-[#B6BCC8]/60";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-[#B6BCC8] mb-1.5 block">
        {label}{required && <span className="text-[#F4A125] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
