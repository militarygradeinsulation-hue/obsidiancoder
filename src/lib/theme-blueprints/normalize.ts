// Normalize a 21st.dev search hit (name + optional palette) into a full
// ThemeBlueprint by assigning a deterministic structural bundle. When remote
// data provides only colors, we still guarantee a materially-different
// blueprint per hit rather than "same layout, different swatches".

import { BUILT_IN_BLUEPRINTS } from "./built-ins";
import type { ThemeBlueprint } from "./types";

// Structural bundles harvested from the built-ins — palette-independent.
// Each bundle contributes all non-color axes so remote colors slot in cleanly.
type StructBundle = Omit<ThemeBlueprint, "id" | "name" | "description" | "source" | "color">;

const BUNDLES: StructBundle[] = BUILT_IN_BLUEPRINTS.map((b) => ({
  typePairing: b.typePairing,
  typeRatio: b.typeRatio,
  spacing: b.spacing,
  radius: b.radius,
  edges: b.edges,
  elevation: b.elevation,
  layout: b.layout,
  motion: b.motion,
}));

function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function pickBundle(seed: string): StructBundle {
  return BUNDLES[hashSeed(seed) % BUNDLES.length];
}

function isDarkHex(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  let r: number, g: number, b: number;
  if (m[1].length === 3) {
    r = parseInt(m[1][0] + m[1][0], 16);
    g = parseInt(m[1][1] + m[1][1], 16);
    b = parseInt(m[1][2] + m[1][2], 16);
  } else {
    r = parseInt(m[1].slice(0, 2), 16);
    g = parseInt(m[1].slice(2, 4), 16);
    b = parseInt(m[1].slice(4, 6), 16);
  }
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.45;
}

export type RemoteThemeHit = {
  identifier: string;
  name: string;
  colors?: string[];
  description?: string;
};

export function normalizeRemoteToBlueprint(hit: RemoteThemeHit): ThemeBlueprint {
  const seed = hit.identifier || hit.name;
  const bundle = pickBundle(seed);
  const cols = (hit.colors ?? []).filter((c) => typeof c === "string" && c.length);
  const bg = cols[0] ?? (BUILT_IN_BLUEPRINTS[hashSeed(seed) % BUILT_IN_BLUEPRINTS.length].color.bg);
  const dark = isDarkHex(bg);
  const accent = cols[1] ?? cols[2] ?? (dark ? "#22d3ee" : "#6366f1");
  const surface = cols[2] ?? (dark ? "#141414" : "#ffffff");
  const surfaceAlt = cols[3] ?? (dark ? "#1c1c1c" : "#f3f4f6");
  const text = dark ? (cols[4] ?? "#f5f5f5") : (cols[4] ?? "#111111");
  const border = cols[5] ?? (dark ? "#2a2a2a" : "#e5e7eb");
  return {
    id: `21st:${seed}`,
    name: hit.name || seed,
    description: hit.description || "Imported from 21st.dev — structural bundle assigned.",
    source: "21st.dev",
    ...bundle,
    color: {
      mode: dark ? "dark" : "light",
      bg,
      surface,
      surfaceAlt,
      text,
      textMuted: dark ? "#9ca3af" : "#64748b",
      accent,
      accentContrast: isDarkHex(accent) ? "#ffffff" : "#111111",
      border,
      danger: "#ef4444",
      success: "#22c55e",
    },
  };
}
