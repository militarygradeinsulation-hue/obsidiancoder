import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Mark } from "@/components/intros/shell";

export function IntrosLanding({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="bg-constellation flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Mark size={40} />
      <span className="mt-4 leading-tight">
        <span className="block text-lg font-semibold tracking-wide">AETHERIS</span>
        <span className="block text-[11px] tracking-[0.25em] text-muted-foreground">INTROS</span>
      </span>

      <h1 className="mt-8 max-w-lg font-serif text-4xl font-semibold leading-tight">
        The intelligence layer for meaningful connections.
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        A professional network with memory. Real people, real context, real intent.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/intros/login"
          className="flex items-center gap-1.5 rounded-full bg-primary px-6 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition"
        >
          Log in <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={onDemo}
          className="rounded-full border border-border px-6 py-2.5 text-[13px] hover:bg-white/5 transition"
        >
          Try the demo
        </button>
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground/60">
        The demo explores Aetheris Intros with a sample network — nothing you do there is saved to a
        real account.
      </p>
    </div>
  );
}

export function IntrosLoading() {
  return (
    <div className="bg-constellation flex min-h-screen items-center justify-center">
      <p className="text-[13px] text-muted-foreground">Loading…</p>
    </div>
  );
}
