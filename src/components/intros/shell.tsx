import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, LogOut, Search } from "lucide-react";
import { InitialsAvatar } from "@/components/intros/primitives";
import { useIntrosMode } from "@/lib/use-intros-mode";

const NAV = [
  { to: "/intros", label: "Home" },
  { to: "/intros/people", label: "People" },
  { to: "/intros/requests", label: "Intros" },
  { to: "/intros/messages", label: "Messages" },
  { to: "/intros/memory", label: "Memory" },
  { to: "/intros/insights", label: "Insights" },
  { to: "/intros/profile", label: "Profile" },
  { to: "/intros/preferences", label: "Settings" },
] as const;

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 3 36 34h-9.6L20 20.4 13.6 34H4z" fill="var(--primary)" />
      <path d="M20 3 36 34h-9.6L20 20.4z" fill="oklch(0.6 0.16 60)" />
    </svg>
  );
}

export function IntrosShell({ children }: { children: ReactNode }) {
  const { mode, user, exitDemo, signOut } = useIntrosMode();
  const isDemo = mode === "demo";
  const accountName = isDemo
    ? "Demo Account"
    : user?.user_metadata?.full_name || user?.email || "Account";
  const accountMeta = isDemo ? "Sample network" : "Live account";

  return (
    <div className="bg-constellation min-h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-6 border-b border-border/60 bg-background/70 px-6 py-3 backdrop-blur-xl">
        <Link to="/intros" className="flex items-center gap-2.5" aria-label="Aetheris Intros home">
          <Mark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-wide">AETHERIS</span>
            <span className="block text-[10px] tracking-[0.2em] text-muted-foreground">INTROS</span>
          </span>
        </Link>

        {isDemo && (
          <button
            onClick={exitDemo}
            title="Exit demo mode"
            className="flex-none rounded-full border border-yellow-400/40 bg-yellow-400/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-yellow-400 transition hover:bg-yellow-400/20"
          >
            Demo
          </button>
        )}

        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/intros" }}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition hover:text-foreground"
              activeProps={{ className: "text-foreground bg-white/5" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <nav
          className="flex flex-1 items-center gap-1 overflow-x-auto lg:hidden"
          aria-label="Primary"
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/intros" }}
              className="flex-none whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition hover:text-foreground"
              activeProps={{ className: "text-foreground bg-white/5" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <label className="hidden h-9 items-center gap-2 rounded-full border border-border bg-white/5 px-3 text-xs text-muted-foreground md:flex">
            <Search className="h-3.5 w-3.5" />
            <input
              placeholder="Search people, companies, or topics..."
              aria-label="Search"
              className="w-44 bg-transparent outline-none placeholder:text-muted-foreground/60"
            />
          </label>
          <button
            aria-label="Notifications"
            className="relative text-muted-foreground hover:text-foreground transition"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <Link to="/intros/profile" className="flex items-center gap-2">
            <InitialsAvatar name={accountName} size={32} />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-[140px] truncate text-xs font-medium">
                {accountName}
              </span>
              <span className="block text-[10.5px] text-muted-foreground">{accountMeta}</span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
          </Link>
          {mode === "live" && (
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="text-muted-foreground hover:text-foreground transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main>{children}</main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-6 py-5 text-[11px] text-muted-foreground">
        <span>People × Context × Opportunity</span>
        <span className="text-muted-foreground/50">
          The intelligence layer for meaningful connections
        </span>
        <span>Aetheris Intros</span>
      </footer>
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`mx-auto max-w-[1400px] px-6 py-6 ${className ?? ""}`}>{children}</section>
  );
}
