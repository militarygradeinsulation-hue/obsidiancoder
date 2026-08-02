import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Rocket, Terminal, ArrowRight } from "lucide-react";

import aetherisLogo from "@/assets/aetheris-logo.png.asset.json";

export const Route = createFileRoute("/home")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    const { unlocked } = await ensureUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Choose your workspace — Aetheris Obsidian" },
      {
        name: "description",
        content:
          "Pick where you want to build: the full Obsidian Coder workspace or the simplified Obsidian Pocket prompt-to-app workspace.",
      },
      { property: "og:title", content: "Choose your workspace — Aetheris Obsidian" },
      {
        property: "og:description",
        content: "Pick where you want to build: full Obsidian Coder or the simplified Obsidian Pocket workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Choose your workspace — Aetheris Obsidian" },
      {
        name: "twitter:description",
        content: "Pick where you want to build: full Obsidian Coder or the simplified Obsidian Pocket workspace.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: HomeChooser,
});

function HomeChooser() {
  return (
    <main className="min-h-screen bg-[#050607] text-[#E8E6E1] flex flex-col items-center justify-center px-4 py-16">
      <img
        src={aetherisLogo.url}
        alt="Aetheris Obsidian Logo"
        className="h-14 w-14 rounded-full object-cover ring-1 ring-[#F4A125]/40"
      />
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Where do you want to build?
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-[#B6BCC8]">
        You can switch between the two workspaces at any time from the top bar.
      </p>

      <div className="mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <Link
          to="/"
          data-testid="home-choose-coder"
          className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[#F4A125]/50 hover:bg-white/[0.06]"
        >
          <Terminal className="h-6 w-6 text-[#F4A125]" strokeWidth={1.5} />
          <h2 className="mt-4 text-lg font-semibold">Obsidian Coder</h2>
          <p className="mt-1.5 text-sm text-[#B6BCC8]">
            The full workspace — multi-tab builds, panels, QA, versions, publishing and GitHub.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-[#F4A125]">
            Open Coder <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          to="/pocket"
          data-testid="home-choose-pocket"
          className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[#F4A125]/50 hover:bg-white/[0.06]"
        >
          <Rocket className="h-6 w-6 text-[#F4A125]" strokeWidth={1.5} />
          <h2 className="mt-4 text-lg font-semibold">Obsidian Pocket</h2>
          <p className="mt-1.5 text-sm text-[#B6BCC8]">
            The simple one-prompt workspace — describe an app, watch it build, save or share it.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-[#F4A125]">
            Open Pocket <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </main>
  );
}
