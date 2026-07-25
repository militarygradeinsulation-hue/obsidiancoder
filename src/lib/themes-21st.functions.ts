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
  .inputValidator((input: { identifier: string }) => {
    const id = String(input?.identifier ?? "").trim().slice(0, 200);
    if (!id) throw new Error("identifier required");
    return { identifier: id };
  })
  .handler(async ({ data }): Promise<{ css: string; name?: string } | null> => {
    const { getTheme } = await import("./twentyfirst.server");
    if (!process.env.TWENTYFIRST_API_KEY) return null;
    const requestId = `theme-${Date.now().toString(36)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    try {
      return await getTheme(data.identifier, { requestId, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  });
