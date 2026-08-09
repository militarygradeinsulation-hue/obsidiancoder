import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section
      id="top"
      className="bg-constellation relative mx-auto w-full max-w-5xl overflow-hidden pt-16"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full overflow-hidden"
      >
        <div className="absolute inset-0 isolate bg-[radial-gradient(20%_80%_at_20%_0%,theme(--color-primary/.12),transparent)]" />
      </div>

      <div className="relative z-10 flex max-w-2xl flex-col gap-5 px-4">
        <a
          href="#how-it-works"
          className={cn(
            "group flex w-fit items-center gap-3 rounded-sm border border-border/40 bg-card p-1 shadow-xs backdrop-blur",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out",
          )}
        >
          <div className="rounded-xs border border-amber/30 bg-amber/10 px-1.5 py-0.5">
            <p className="font-mono text-xs text-amber">FREE</p>
          </div>

          <span className="text-xs text-muted-foreground">
            no login, no credit card &mdash; just describe it
          </span>
          <span className="block h-5 border-l border-border/40" />

          <div className="pr-1">
            <ArrowRight className="size-3 -translate-x-0.5 text-muted-foreground duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-amber" />
          </div>
        </a>

        <h1
          className={cn(
            "text-balance font-serif text-4xl font-medium leading-tight text-foreground md:text-5xl",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out",
          )}
        >
          Vibe Coding. <span className="text-amber">Elevated.</span>
        </h1>

        <p
          className={cn(
            "text-sm tracking-wide text-muted-foreground sm:text-lg md:text-xl",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out",
          )}
        >
          Describe what you want to build, one thing at a time. Obsidian remembers what already
          works and shows the result live &mdash; no setup, no boilerplate, just flow.
        </p>

        <div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          <Button variant="outline" asChild>
            <a href="#how-it-works">
              <Sparkles className="mr-2 size-4" data-icon="inline-start" />
              See how it works
            </a>
          </Button>
          <Button asChild>
            <Link to="/">
              Start building
              <ArrowRight className="ml-2 size-4" data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        <div
          className={cn(
            "absolute -inset-x-20 inset-y-0 -translate-y-1/3 scale-120 rounded-full",
            "bg-[radial-gradient(ellipse_at_center,theme(--color-primary/.18),transparent,transparent)]",
            "blur-[60px]",
          )}
        />
        <div
          className={cn(
            "mask-b-from-60% relative mt-8 -mr-56 overflow-hidden px-2 sm:mt-12 sm:mr-0 md:mt-20",
            "fade-in slide-in-from-bottom-5 animate-in fill-mode-backwards delay-100 duration-1000 ease-out",
          )}
        >
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div className="glass-panel-amber glass-shine relative mx-auto aspect-video max-w-5xl overflow-hidden p-2">
      <div className="flex h-full w-full overflow-hidden rounded-[calc(var(--radius)-6px)] border border-border/30 bg-background/60">
        <div className="hidden w-40 flex-col gap-2 border-r border-border/30 p-3 sm:flex">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" viewBox="0 0 32 40" fill="none" aria-hidden="true">
              <path
                d="M16 0L8 10L16 20L8 30L16 40M16 0L24 10L16 20L24 30L16 40"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-amber"
              />
            </svg>
            <span className="font-mono text-[10px] font-semibold tracking-wide text-amber">
              OBSIDIAN
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {["Home", "Notes", "Graph", "Tasks"].map((item, i) => (
              <div
                key={item}
                className={cn(
                  "rounded px-2 py-1.5 text-[10px]",
                  i === 0
                    ? "border-l-2 border-amber bg-amber/10 text-amber"
                    : "text-muted-foreground/70",
                )}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex-1 space-y-2 overflow-hidden p-3">
            <div className="flex justify-start">
              <div className="max-w-[75%] rounded-lg rounded-tl-sm bg-white/5 px-3 py-2 text-[10px] text-muted-foreground/90">
                Describe what you want to build&hellip;
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[75%] rounded-lg rounded-tr-sm border border-amber/20 bg-amber/10 px-3 py-2 text-[10px] text-foreground">
                A pricing page with three tiers and a toggle for annual billing
              </div>
            </div>
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-lg rounded-tl-sm bg-white/5 px-3 py-2 text-[10px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin text-amber" />
                Building&hellip;
              </div>
            </div>
          </div>
          <div className="border-t border-border/30 p-2">
            <div className="flex items-center gap-2 rounded border border-border/30 bg-white/5 px-3 py-2">
              <span className="flex-1 truncate text-[10px] text-muted-foreground/40">
                What do you want to build?
              </span>
              <div className="grid size-5 flex-shrink-0 place-items-center rounded bg-amber text-background">
                <ArrowRight className="size-3" />
              </div>
            </div>
          </div>
        </div>

        <div className="hidden w-56 flex-col border-l border-border/30 bg-gradient-to-br from-background via-background to-amber/5 sm:flex">
          <div className="border-b border-border/30 px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-amber/60">
            Preview
          </div>
          <div className="flex-1 space-y-1 p-3 font-mono text-[8px] leading-relaxed text-muted-foreground/50">
            <div>&lt;section class=&quot;pricing&quot;&gt;</div>
            <div className="pl-2">&lt;div class=&quot;tier&quot;&gt;</div>
            <div className="pl-4 text-amber/50">Starter &mdash; $0</div>
            <div className="pl-2">&lt;/div&gt;</div>
            <div className="pl-2">&lt;div class=&quot;tier&quot;&gt;</div>
            <div className="pl-4 text-amber/50">Pro &mdash; $19</div>
            <div className="pl-2">&lt;/div&gt;</div>
            <div>&lt;/section&gt;</div>
          </div>
        </div>
      </div>
    </div>
  );
}
