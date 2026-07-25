// Server functions exposing 21st.dev themes to the sandbox UI.
// Metadata search is free; get_theme is metered on the 21st account.
import { createServerFn } from "@tanstack/react-start";

export interface UiThemeHit {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  colors?: string[];
  identifier: string;
  author?: string;
}

export const searchThemesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { query?: string; limit?: number }) => ({
    query: (input?.query ?? "").slice(0, 120),
    limit: Math.max(1, Math.min(24, Number(input?.limit ?? 12))),
  }))
  .handler(async ({ data }): Promise<{ themes: UiThemeHit[]; enabled: boolean }> => {
    const { searchThemes } = await import("./twentyfirst.server");
    const enabled = !!process.env.TWENTYFIRST_API_KEY;
    if (!enabled) return { themes: [], enabled: false };
    const requestId = `themes-${Date.now().toString(36)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const themes = await searchThemes(data.query, {
        limit: data.limit,
        requestId,
        signal: ac.signal,
      });
      return { themes, enabled: true };
    } finally {
      clearTimeout(t);
    }
  });

export const getThemeCssFn = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string; name?: string; colors?: string[] }) => {
    const id = String(input?.identifier ?? "").trim().slice(0, 200);
    if (!id) throw new Error("identifier required");
    const colors = Array.isArray(input?.colors)
      ? input.colors.filter((c) => typeof c === "string").slice(0, 12).map((c) => c.slice(0, 40))
      : [];
    return { identifier: id, name: (input?.name ?? "").slice(0, 120), colors };
  })
  .handler(async ({ data }): Promise<{ css: string; name?: string; source: "api" | "fallback" }> => {
    const { getTheme } = await import("./twentyfirst.server");
    const requestId = `theme-${Date.now().toString(36)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    try {
      if (process.env.TWENTYFIRST_API_KEY) {
        const res = await getTheme(data.identifier, { requestId, signal: ac.signal });
        if (res?.css) return { css: res.css, name: res.name ?? data.name, source: "api" };
      }
      // Fallback: synthesize a shadcn-compatible :root block from the palette
      // we already have from the search hit (or a deterministic one from the id).
      const palette = data.colors.length ? data.colors : deterministicPalette(data.identifier || data.name);
      const css = synthesizeThemeCss(palette);
      return { css, name: data.name || data.identifier, source: "fallback" };
    } finally {
      clearTimeout(t);
    }
  });

function deterministicPalette(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const base = h % 360;
  return [0, 40, 200, 320, 80, 160].map((off, i) => {
    const hue = (base + off) % 360;
    const sat = 55 + (i * 7) % 25;
    const light = 30 + (i * 11) % 30;
    return `hsl(${hue} ${sat}% ${light}%)`;
  });
}

function synthesizeThemeCss(palette: string[]): string {
  const [c1, c2, c3, c4, c5, c6] = palette;
  const bg = c3 ?? c2 ?? "#0a0b0e";
  const fg = "#f2eee7";
  const primary = c1 ?? "#F4A125";
  const secondary = c2 ?? primary;
  const accent = c4 ?? c1 ?? "#DD9324";
  const muted = c5 ?? "#111317";
  const border = c6 ?? "rgba(244,161,37,0.22)";
  return `:root {
  --background: ${bg};
  --foreground: ${fg};
  --primary: ${primary};
  --primary-foreground: #111317;
  --secondary: ${secondary};
  --secondary-foreground: #f2eee7;
  --accent: ${accent};
  --accent-foreground: #111317;
  --muted: ${muted};
  --muted-foreground: #B6BCC8;
  --card: ${muted};
  --card-foreground: ${fg};
  --border: ${border};
  --ring: ${primary};
  --radius: 0.75rem;
}
body { background: var(--background); color: var(--foreground); }
`;
}

