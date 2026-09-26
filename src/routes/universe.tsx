import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUniverseAccess } from "@/lib/gate.functions";
import { buildAuthUrl } from "@/lib/redirect-safe";

export const Route = createFileRoute("/universe")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aetheris Universe — Members only | Obsidian" },
      { name: "description", content: "Aetheris Universe is included with every paid Obsidian plan." },
      { property: "og:title", content: "Aetheris Universe — Members only" },
      { property: "og:description", content: "Included with every paid Obsidian plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UniversePage,
});

type State = "checking" | "signed-out" | "locked" | "error";

function UniversePage() {
  const check = useServerFn(getUniverseAccess);
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { if (!cancelled) setState("signed-out"); return; }
      try {
        const res = await check();
        if (cancelled) return;
        if (res.ok) window.location.replace(res.url);
        else setState("locked");
      } catch { if (!cancelled) setState("error"); }
    })();
    return () => { cancelled = true; };
  }, [check]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#100F14] px-6 text-[#f2eee7]">
      <div className="w-full max-w-md rounded-3xl border border-[#F4A125]/25 bg-gradient-to-b from-[#171208] to-[#100F14] p-8 text-center">
        <span className="rounded-full border border-[#F4A125]/40 bg-[#F4A125]/10 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#F6B24A]">
          Members only
        </span>
        <h1 className="mt-5 text-3xl font-semibold">Aetheris Universe</h1>
        {state === "checking" && <p className="mt-4 text-sm text-[#a5a29c]">Checking your membership…</p>}
        {state === "signed-out" && (
          <>
            <p className="mt-4 text-sm text-[#a5a29c]">Sign in with your paid account to enter.</p>
            <a href={buildAuthUrl("signin", "/universe")} className="mt-6 inline-block rounded-xl bg-gradient-to-b from-[#F6B24A] to-[#DD9324] px-8 py-3 font-semibold text-[#14100a]">Sign in</a>
          </>
        )}
        {(state === "locked" || state === "error") && (
          <>
            <p className="mt-4 text-sm text-[#a5a29c]">
              {state === "error" ? "We couldn't check your membership. Try again in a moment." : "Aetheris Universe unlocks with any paid plan — Pocket from $10/month."}
            </p>
            <Link to="/unlock" hash="plans" className="mt-6 inline-block rounded-xl bg-gradient-to-b from-[#F6B24A] to-[#DD9324] px-8 py-3 font-semibold text-[#14100a]">See plans</Link>
          </>
        )}
      </div>
    </main>
  );
}
