import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function InitialsAvatar({
  name,
  size = 36,
  square = false,
  live = false,
  className,
}: {
  name: string;
  size?: number;
  square?: boolean;
  live?: boolean;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="relative inline-flex flex-none">
      <Avatar
        className={cn(square ? "rounded-md" : "rounded-full", className)}
        style={{ width: size, height: size }}
      >
        <AvatarFallback
          className={cn(
            "bg-white/8 text-foreground/80 font-medium",
            square ? "rounded-md" : "rounded-full",
          )}
          style={{ fontSize: size * 0.34 }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      {live && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />
      )}
    </span>
  );
}

export function Panel({
  title,
  action,
  onAction,
  children,
  className,
}: {
  title?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass-panel p-4", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h3 className="text-[13px] font-semibold tracking-wide text-foreground/90">{title}</h3>
          )}
          {action === "kebab" ? (
            <button
              aria-label="More"
              className="text-muted-foreground hover:text-foreground transition"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          ) : action ? (
            <button
              onClick={onAction}
              className="text-[11px] font-medium uppercase tracking-wider text-primary hover:opacity-80 transition"
            >
              {action}
            </button>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}

export function Pill({
  children,
  on = false,
  onClick,
}: {
  children: ReactNode;
  on?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex items-center rounded-full border px-3 py-1 text-[11.5px] transition",
    on ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground",
    onClick && "cursor-pointer hover:border-primary/40 hover:text-foreground",
  );
  if (onClick) {
    return (
      <button type="button" aria-pressed={on} onClick={onClick} className={className}>
        {children}
      </button>
    );
  }
  return <span className={className}>{children}</span>;
}

export function Tag({ children, blue = false }: { children: ReactNode; blue?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px]",
        blue
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Ring({
  value,
  label,
  note,
  size = 66,
}: {
  value: number;
  label: string;
  note?: string;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center" style={{ width: size + 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="oklch(1 0 0 / 0.1)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="52%"
          textAnchor="middle"
          fontSize={size * 0.22}
          fill="currentColor"
          className="font-semibold"
        >
          {value}%
        </text>
      </svg>
      <div className="text-[11px] font-medium leading-tight">{label}</div>
      {note && <div className="text-[10.5px] leading-snug text-muted-foreground">{note}</div>}
    </div>
  );
}

export function Creed({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <div className={cn("font-serif text-sm leading-relaxed text-foreground/70", className)}>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export function Plate({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-gradient-to-br from-primary/20 via-background to-primary/5",
        className,
      )}
      style={{ minHeight: 120 }}
    >
      {children}
    </div>
  );
}

export function StatLine({ stats }: { stats: { n: string; l: string }[] }) {
  return (
    <div
      className="grid border-t border-border pt-3"
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((s) => (
        <div key={s.l}>
          <div className="font-serif text-xl font-semibold">{s.n}</div>
          <div className="text-[11px] text-muted-foreground">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

export function IconLine({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-[12.5px] text-foreground/80">
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function ListRow({
  left,
  title,
  subtitle,
  right,
}: {
  left: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
      {left}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{title}</div>
        {subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
