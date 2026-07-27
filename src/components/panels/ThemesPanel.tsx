// Themes browser — built-in ThemeBlueprints first, 21st.dev additional.
// Renders a floating modal opened from the preview header.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Search, Sparkles, Download, Palette, Loader2, Shuffle } from "lucide-react";
import { searchThemesFn, getThemeCssFn, type UiThemeHit } from "@/lib/themes-21st.functions";
import {
  BUILT_IN_BLUEPRINTS,
  compileBlueprint,
  getBuiltIn,
  normalizeRemoteToBlueprint,
  pickFarthest,
  type ThemeBlueprint,
} from "@/lib/theme-blueprints";

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (css: string, name?: string, blueprintId?: string) => void;
  currentThemeName?: string;
  currentBlueprintId?: string;
  onClear?: () => void;
};

const PRESET_QUERIES = [
  "dark dashboard", "neobrutalist", "minimal", "pastel", "cyberpunk",
  "editorial", "glassmorphism", "brutalist mono", "warm sunset", "corporate blue",
];

export function ThemesPanel({ open, onClose, onApply, currentThemeName, currentBlueprintId, onClear }: Props) {
  const search = useServerFn(searchThemesFn);
  const getCss = useServerFn(getThemeCssFn);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"built-in" | "21st">("built-in");
  const [themes, setThemes] = useState<UiThemeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true); setError(null);
    try {
      const res = await search({ data: { query: q, limit: 18 } });
      setThemes(res.themes);
      setEnabled(res.enabled);
      if (!res.enabled) setError("21st.dev key is not configured on the server.");
      else if (!res.themes.length) setError("No themes matched — try a different keyword.");
    } catch {
      setError("Theme search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (open && tab === "21st" && !themes.length && !loading) runSearch("");
  }, [open, tab, themes.length, loading, runSearch]);

  const applyBlueprint = useCallback((bp: ThemeBlueprint) => {
    const compiled = compileBlueprint(bp);
    onApply(compiled.css, bp.name, bp.id);
    onClose();
  }, [onApply, onClose]);

  const surpriseMe = useCallback(() => {
    const current = currentBlueprintId ? getBuiltIn(currentBlueprintId) ?? null : null;
    const next = pickFarthest(BUILT_IN_BLUEPRINTS, current);
    if (next) applyBlueprint(next);
  }, [currentBlueprintId, applyBlueprint]);



  const applyTheme = useCallback(async (t: UiThemeHit) => {
    setApplyingId(t.identifier); setError(null);
    try {
      // Normalize remote hit → full ThemeBlueprint (structural bundle + palette).
      const bp = normalizeRemoteToBlueprint({
        identifier: t.identifier, name: t.name, colors: t.colors ?? [], description: t.description,
      });
      const compiled = compileBlueprint(bp);
      onApply(compiled.css, bp.name, bp.id);
      onClose();
    } catch {
      setError("Could not import that theme.");
    } finally {
      setApplyingId(null);
    }
  }, [onApply, onClose]);


  const downloadTheme = useCallback(async (t: UiThemeHit) => {
    setApplyingId(t.identifier);
    try {
      const res = await getCss({ data: { identifier: t.identifier, name: t.name, colors: t.colors ?? [] } });
      if (!res?.css) return;
      const blob = new Blob([res.css], { type: "text/css" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(res.name ?? t.name).replace(/[^a-z0-9-_]+/gi, "-")}.css`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setApplyingId(null); }
  }, [getCss]);


  if (!open) return null;

  return (
    <div className="themes-modal-backdrop" onClick={onClose}>
      <div className="themes-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Visual themes">
        <div className="themes-header">
          <div className="themes-title">
            <Palette className="h-4 w-4" style={{ color: "#F4A125" }} />
            <div>
              <h2>Visual Themes</h2>
              <p>10 built-in blueprints (9-axis) plus 21st.dev imports — apply to your sandbox in one click.</p>
            </div>
          </div>
          <div className="themes-actions">
            {currentThemeName ? (
              <span className="themes-current" title={`Active: ${currentThemeName}`}>
                <span className="themes-current-dot" /> {currentThemeName}
              </span>
            ) : null}
            {currentThemeName && onClear ? (
              <button type="button" className="themes-btn ghost" onClick={onClear}>Reset</button>
            ) : null}
            <button type="button" className="themes-btn ghost" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form className="themes-search" onSubmit={(e) => { e.preventDefault(); runSearch(query); }}>
          <Search className="h-4 w-4" style={{ opacity: 0.6 }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search themes (site name, mood, colors)…"
            aria-label="Search themes"
          />
          <button type="submit" className="themes-btn primary" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Search
          </button>
        </form>

        <div className="themes-presets">
          {PRESET_QUERIES.map((p) => (
            <button
              key={p}
              type="button"
              className="themes-chip"
              onClick={() => { setQuery(p); runSearch(p); }}
              disabled={loading}
            >
              {p}
            </button>
          ))}
        </div>

        {error ? <div className="themes-error">{error}</div> : null}

        {!enabled ? null : (
          <div className="themes-grid">
            {loading && !themes.length
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="theme-card skeleton" />)
              : themes.map((t) => (
                  <ThemeCard
                    key={t.identifier}
                    theme={t}
                    applying={applyingId === t.identifier}
                    onApply={() => applyTheme(t)}
                    onDownload={() => downloadTheme(t)}
                  />
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Deterministic palette derived from a theme's identifier so tiles are never
 * visually blank when the 21st.dev search response omits colors/preview. */
function fallbackPalette(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const base = h % 360;
  return [0, 40, 200, 320, 80].map((off, i) => {
    const hue = (base + off) % 360;
    const sat = 55 + (i * 7) % 25;
    const light = 30 + (i * 11) % 30;
    return `hsl(${hue} ${sat}% ${light}%)`;
  });
}

function ThemeCard({
  theme: t,
  applying,
  onApply,
  onDownload,
}: {
  theme: UiThemeHit;
  applying: boolean;
  onApply: () => void;
  onDownload: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const cols = (t.colors?.length ? t.colors : fallbackPalette(t.identifier || t.name)).slice(0, 6);
  const showImage = !!t.previewUrl && !imgFailed;
  const gradient = `linear-gradient(135deg, ${cols[0] ?? "#1a1d24"} 0%, ${cols[1] ?? "#0a0b0e"} 55%, ${cols[2] ?? "#000"} 100%)`;

  return (
    <div className="theme-card">
      <div className="theme-preview" style={{ background: gradient }}>
        {showImage ? (
          <img
            src={t.previewUrl}
            alt={`${t.name} preview`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={() => setImgFailed(true)}
            className="theme-preview-img"
          />
        ) : null}
        <div className="theme-swatches">
          {cols.map((c, i) => (
            <span key={i} style={{ background: c }} title={c} />
          ))}
        </div>
      </div>
      <div className="theme-meta">
        <div className="theme-name" title={t.name}>{t.name}</div>
        {t.author ? <div className="theme-author">by {t.author}</div> : null}
        {t.description ? <div className="theme-desc">{t.description}</div> : null}
      </div>
      <div className="theme-actions">
        <button
          type="button"
          className="themes-btn primary sm"
          onClick={onApply}
          disabled={applying}
        >
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Apply
        </button>
        <button
          type="button"
          className="themes-btn ghost sm"
          onClick={onDownload}
          title="Download CSS"
          disabled={applying}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

