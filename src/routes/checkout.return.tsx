import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { unlockIfPro } from "@/lib/gate.functions";
import { refreshEntitlement } from "@/hooks/useEntitlement";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (s: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  component: ReturnPage,
  head: () => ({ meta: [{ title: "Payment complete — Aetheris Obsidian" }, { name: "robots", content: "noindex,nofollow" }] }),
});

function ReturnPage() {
  const { session_id } = Route.useSearch();
  const router = useRouter();
  const proUnlock = useServerFn(unlockIfPro);
  const [state, setState] = useState<"verifying" | "ready" | "pending">("verifying");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    async function tick() {
      attempts++;
      try {
        const { ok } = await proUnlock({});
        if (cancelled) return;
        if (ok) {
          await refreshEntitlement();
          setState("ready");
          setTimeout(() => { if (!cancelled) router.navigate({ to: "/" }); }, 900);
          return;
        }
      } catch { /* retry */ }
      if (attempts >= 6) { setState("pending"); return; }
      setTimeout(tick, 1500);
    }
    tick();
    return () => { cancelled = true; };
  }, [proUnlock, router]);

  return (
    <div className="min-h-screen bg-[#050607] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] p-8 text-center shadow-2xl">
        {state === "verifying" && <Loader2 className="mx-auto h-12 w-12 text-[#F4A125] animate-spin" />}
        {state !== "verifying" && <CheckCircle2 className="mx-auto h-12 w-12 text-[#F4A125]" />}
        <h1 className="mt-4 text-xl font-semibold text-[#f2eee7]">
          {state === "verifying" ? "Confirming your subscription…" : "You're in."}
        </h1>
        <p className="mt-2 text-sm text-[#B6BCC8]">
          {state === "verifying"
            ? "Talking to Stripe to activate your Pro access."
            : state === "ready"
            ? "Pro access is live. Opening Obsidian…"
            : "Your payment is being processed. Refresh in a moment, or return to the app to sign in — Pro will unlock as soon as Stripe confirms."}
        </p>
        {session_id && (
          <p className="mt-3 text-[10px] text-[#B6BCC8]/60 break-all">Session: {session_id}</p>
        )}
        <Link
          to="/"
          className="mt-6 inline-flex px-4 py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-semibold"
        >
          Back to Obsidian
        </Link>
      </div>
    </div>
  );
}
