import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Models", href: "#models" },
  { label: "FAQ", href: "#faq" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/30 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <a href="#top" className="flex items-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 32 40" fill="none" aria-hidden="true">
            <path
              d="M16 0L8 10L16 20L8 30L16 40M16 0L24 10L16 20L24 30L16 40"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-amber"
            />
          </svg>
          <span className="font-mono text-sm font-semibold tracking-wide text-amber">OBSIDIAN</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/">Launch Obsidian</Link>
          </Button>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 text-muted-foreground hover:text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden border-b border-border/30 md:hidden",
          open ? "max-h-64" : "max-h-0 border-b-0",
          "transition-[max-height] duration-300 ease-out",
        )}
      >
        <nav className="flex flex-col gap-1 px-4 pb-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded px-2 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" className="flex-1" asChild>
              <Link to="/">Sign in</Link>
            </Button>
            <Button size="sm" className="flex-1" asChild>
              <Link to="/">Launch Obsidian</Link>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
