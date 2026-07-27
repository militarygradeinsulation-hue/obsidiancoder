// Ten built-in ThemeBlueprints. Materially different on multiple axes each.
// All values concrete; no mood-only labels. Each blueprint must remain
// recognisably itself when compiled to CSS and applied to a fixture.

import type { ThemeBlueprint } from "./types";

const SWISS: ThemeBlueprint = {
  id: "swiss-editorial",
  name: "Swiss Editorial",
  description: "Grid-strict editorial. Neutral palette, tight tracking, no shadows.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Neue Haas Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif',
    bodyFamily: '"Neue Haas Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif',
    monoFamily: '"IBM Plex Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.2, baseSizePx: 16, headingWeight: 500, bodyWeight: 400,
    headingTracking: "-0.02em", headingLineHeight: 1.08, bodyLineHeight: 1.55, headingCase: "normal",
  },
  spacing: { step: 8, sectionYPx: 96, gridGapPx: 24, cardPadPx: 24, containerMaxPx: 1200 },
  radius: { sm: "0px", md: "0px", lg: "0px", pill: "0px" },
  edges: { borderWidthPx: 1, borderStyle: "solid", borderColor: "#111111", dividerStyle: "hairline", outlineOffsetPx: 2 },
  elevation: { card: "none", cardHover: "none", overlay: "0 0 0 1px #111",
    focusRing: "2px solid #111" },
  layout: "single-column-editorial",
  color: {
    mode: "light", bg: "#f5f5f2", surface: "#ffffff", surfaceAlt: "#eeece6",
    text: "#111111", textMuted: "#5b5b58", accent: "#111111", accentContrast: "#ffffff",
    border: "#111111", danger: "#b00020", success: "#0a6b3b",
  },
  motion: { durationMs: 120, easing: "linear", hoverLiftPx: 0, reducedMotionSafe: true },
};

const NEO_BRUTAL: ThemeBlueprint = {
  id: "neo-brutalist",
  name: "Neo-Brutalist",
  description: "Thick borders, hard drop-shadows, high-contrast primaries.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Space Grotesk", "Archivo Black", system-ui, sans-serif',
    bodyFamily: '"Space Grotesk", system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.414, baseSizePx: 17, headingWeight: 800, bodyWeight: 500,
    headingTracking: "-0.01em", headingLineHeight: 1.0, bodyLineHeight: 1.5, headingCase: "normal",
  },
  spacing: { step: 8, sectionYPx: 80, gridGapPx: 20, cardPadPx: 28, containerMaxPx: 1280 },
  radius: { sm: "6px", md: "10px", lg: "16px", pill: "9999px" },
  edges: { borderWidthPx: 3, borderStyle: "solid", borderColor: "#0b0b0b", dividerStyle: "heavy", outlineOffsetPx: 4 },
  elevation: {
    card: "6px 6px 0 0 #0b0b0b",
    cardHover: "10px 10px 0 0 #0b0b0b",
    overlay: "8px 8px 0 0 #0b0b0b",
    focusRing: "3px solid #ffe14a",
  },
  layout: "poster-brutalist",
  color: {
    mode: "light", bg: "#fff7d1", surface: "#ffffff", surfaceAlt: "#ffe14a",
    text: "#0b0b0b", textMuted: "#3b3a2f", accent: "#ff4a2b", accentContrast: "#ffffff",
    border: "#0b0b0b", danger: "#d20000", success: "#0a7c2f",
  },
  motion: { durationMs: 90, easing: "steps(2,end)", hoverLiftPx: -2, reducedMotionSafe: true },
};

const TERMINAL: ThemeBlueprint = {
  id: "terminal",
  name: "Terminal",
  description: "Monospaced CLI aesthetic on near-black with phosphor accent.",
  source: "built-in",
  typePairing: {
    headingFamily: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
    bodyFamily: '"JetBrains Mono", ui-monospace, monospace',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.125, baseSizePx: 14, headingWeight: 500, bodyWeight: 400,
    headingTracking: "0em", headingLineHeight: 1.2, bodyLineHeight: 1.55, headingCase: "normal",
  },
  spacing: { step: 4, sectionYPx: 32, gridGapPx: 8, cardPadPx: 12, containerMaxPx: 1160 },
  radius: { sm: "2px", md: "2px", lg: "2px", pill: "2px" },
  edges: { borderWidthPx: 1, borderStyle: "solid", borderColor: "#2a3a2a", dividerStyle: "hairline", outlineOffsetPx: 1 },
  elevation: { card: "none", cardHover: "0 0 0 1px #7fff9a inset", overlay: "0 0 0 1px #7fff9a",
    focusRing: "1px dashed #7fff9a" },
  layout: "terminal-cli",
  color: {
    mode: "dark", bg: "#050807", surface: "#0a110c", surfaceAlt: "#0f1712",
    text: "#c8ffce", textMuted: "#6a8f74", accent: "#7fff9a", accentContrast: "#050807",
    border: "#2a3a2a", danger: "#ff5b5b", success: "#7fff9a",
  },
  motion: { durationMs: 60, easing: "linear", hoverLiftPx: 0, reducedMotionSafe: true },
};

const SOFT_CONSUMER: ThemeBlueprint = {
  id: "soft-consumer",
  name: "Soft Consumer",
  description: "Warm pastels, rounded shapes, gentle shadow, humanist type.",
  source: "built-in",
  typePairing: {
    headingFamily: '"General Sans", "Nunito", ui-sans-serif, system-ui, sans-serif',
    bodyFamily: '"Nunito", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"IBM Plex Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.25, baseSizePx: 16, headingWeight: 700, bodyWeight: 400,
    headingTracking: "-0.01em", headingLineHeight: 1.15, bodyLineHeight: 1.6, headingCase: "normal",
  },
  spacing: { step: 8, sectionYPx: 88, gridGapPx: 24, cardPadPx: 28, containerMaxPx: 1120 },
  radius: { sm: "12px", md: "20px", lg: "28px", pill: "9999px" },
  edges: { borderWidthPx: 0, borderStyle: "solid", borderColor: "transparent", dividerStyle: "hairline", outlineOffsetPx: 2 },
  elevation: {
    card: "0 6px 24px -8px rgba(80,50,20,0.18)",
    cardHover: "0 12px 32px -10px rgba(80,50,20,0.24)",
    overlay: "0 20px 60px -20px rgba(80,50,20,0.35)",
    focusRing: "3px solid #ffb26b",
  },
  layout: "hero-centered-marketing",
  color: {
    mode: "light", bg: "#fff6ec", surface: "#ffffff", surfaceAlt: "#ffe7cf",
    text: "#3b2a1a", textMuted: "#8a7a68", accent: "#ff8f4a", accentContrast: "#ffffff",
    border: "#f0d8bf", danger: "#e2554f", success: "#3aa172",
    gradient: "linear-gradient(135deg,#ffb98a,#ff8f4a)",
  },
  motion: { durationMs: 220, easing: "cubic-bezier(.2,.8,.2,1)", hoverLiftPx: -2, reducedMotionSafe: true },
};

const DENSE_OPS: ThemeBlueprint = {
  id: "dense-ops",
  name: "Dense Ops",
  description: "Sidebar-first operator UI, compact spacing, monochrome slate.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    bodyFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.125, baseSizePx: 13, headingWeight: 600, bodyWeight: 400,
    headingTracking: "-0.005em", headingLineHeight: 1.2, bodyLineHeight: 1.45, headingCase: "normal",
  },
  spacing: { step: 4, sectionYPx: 24, gridGapPx: 8, cardPadPx: 12, containerMaxPx: 1440 },
  radius: { sm: "4px", md: "6px", lg: "8px", pill: "9999px" },
  edges: { borderWidthPx: 1, borderStyle: "solid", borderColor: "#1f2937", dividerStyle: "hairline", outlineOffsetPx: 1 },
  elevation: { card: "0 1px 0 rgba(0,0,0,0.4)", cardHover: "0 2px 6px rgba(0,0,0,0.35)",
    overlay: "0 10px 30px rgba(0,0,0,0.5)", focusRing: "2px solid #60a5fa" },
  layout: "sidebar-dense-ops",
  color: {
    mode: "dark", bg: "#0b0f14", surface: "#111827", surfaceAlt: "#0f1420",
    text: "#e5e7eb", textMuted: "#94a3b8", accent: "#60a5fa", accentContrast: "#0b0f14",
    border: "#1f2937", danger: "#ef4444", success: "#22c55e",
  },
  motion: { durationMs: 120, easing: "cubic-bezier(.3,.7,.3,1)", hoverLiftPx: 0, reducedMotionSafe: true },
};

const LUXE_DARK: ThemeBlueprint = {
  id: "luxe-dark",
  name: "Luxe Dark",
  description: "Editorial dark serif with gold accent, generous spacing.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Fraunces", "Playfair Display", Georgia, serif',
    bodyFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"IBM Plex Mono", ui-monospace, monospace',
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600&family=Inter:wght@400;500;600&display=swap",
  },
  typeRatio: {
    scale: 1.5, baseSizePx: 17, headingWeight: 600, bodyWeight: 400,
    headingTracking: "-0.02em", headingLineHeight: 1.05, bodyLineHeight: 1.6, headingCase: "normal",
  },
  spacing: { step: 8, sectionYPx: 144, gridGapPx: 32, cardPadPx: 40, containerMaxPx: 1200 },
  radius: { sm: "2px", md: "4px", lg: "6px", pill: "9999px" },
  edges: { borderWidthPx: 1, borderStyle: "solid", borderColor: "#3b2f1f", dividerStyle: "hairline", outlineOffsetPx: 3 },
  elevation: {
    card: "0 30px 60px -30px rgba(0,0,0,0.8)",
    cardHover: "0 40px 80px -30px rgba(0,0,0,0.85)",
    overlay: "0 50px 120px -40px rgba(0,0,0,0.9)",
    focusRing: "2px solid #c9953d",
  },
  layout: "asymmetric-magazine",
  color: {
    mode: "dark", bg: "#0b0906", surface: "#141009", surfaceAlt: "#1c1710",
    text: "#f2eee7", textMuted: "#a89880", accent: "#c9953d", accentContrast: "#0b0906",
    border: "#3b2f1f", danger: "#e05a4a", success: "#8ab27a",
    gradient: "radial-gradient(1200px 600px at 30% -10%, rgba(201,149,61,0.18), transparent 60%)",
  },
  motion: { durationMs: 320, easing: "cubic-bezier(.2,.7,.2,1)", hoverLiftPx: -1, reducedMotionSafe: true },
};

const CLEAN_SAAS: ThemeBlueprint = {
  id: "clean-saas",
  name: "Clean SaaS",
  description: "Neutral light SaaS: crisp indigo accent, mid radii, soft shadows.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    bodyFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.25, baseSizePx: 16, headingWeight: 700, bodyWeight: 400,
    headingTracking: "-0.02em", headingLineHeight: 1.15, bodyLineHeight: 1.55, headingCase: "normal",
  },
  spacing: { step: 8, sectionYPx: 96, gridGapPx: 24, cardPadPx: 24, containerMaxPx: 1200 },
  radius: { sm: "6px", md: "10px", lg: "14px", pill: "9999px" },
  edges: { borderWidthPx: 1, borderStyle: "solid", borderColor: "#e5e7eb", dividerStyle: "hairline", outlineOffsetPx: 2 },
  elevation: {
    card: "0 1px 2px rgba(15,23,42,0.06), 0 4px 12px -4px rgba(15,23,42,0.08)",
    cardHover: "0 4px 8px rgba(15,23,42,0.08), 0 12px 24px -8px rgba(15,23,42,0.12)",
    overlay: "0 24px 48px -16px rgba(15,23,42,0.24)",
    focusRing: "3px solid rgba(99,102,241,0.5)",
  },
  layout: "hero-centered-marketing",
  color: {
    mode: "light", bg: "#f8fafc", surface: "#ffffff", surfaceAlt: "#f1f5f9",
    text: "#0f172a", textMuted: "#64748b", accent: "#6366f1", accentContrast: "#ffffff",
    border: "#e5e7eb", danger: "#ef4444", success: "#10b981",
  },
  motion: { durationMs: 180, easing: "cubic-bezier(.2,.8,.2,1)", hoverLiftPx: -1, reducedMotionSafe: true },
};

const PLAYFUL_CLAY: ThemeBlueprint = {
  id: "playful-clay",
  name: "Playful Clay",
  description: "Chunky rounded shapes with dual-tone soft shadows and bold color.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Chunk", "Space Grotesk", "Baloo 2", ui-sans-serif, system-ui, sans-serif',
    bodyFamily: '"Nunito", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.333, baseSizePx: 17, headingWeight: 800, bodyWeight: 500,
    headingTracking: "-0.01em", headingLineHeight: 1.05, bodyLineHeight: 1.55, headingCase: "normal",
  },
  spacing: { step: 8, sectionYPx: 96, gridGapPx: 24, cardPadPx: 32, containerMaxPx: 1200 },
  radius: { sm: "16px", md: "24px", lg: "36px", pill: "9999px" },
  edges: { borderWidthPx: 0, borderStyle: "solid", borderColor: "transparent", dividerStyle: "none", outlineOffsetPx: 3 },
  elevation: {
    card: "0 12px 0 -6px #f2c8ff, 0 24px 40px -20px rgba(80,30,120,0.35)",
    cardHover: "0 18px 0 -6px #f2c8ff, 0 32px 48px -20px rgba(80,30,120,0.45)",
    overlay: "0 40px 80px -30px rgba(80,30,120,0.6)",
    focusRing: "4px solid #ff7ab6",
  },
  layout: "canvas-modular",
  color: {
    mode: "light", bg: "#fff8ec", surface: "#ffffff", surfaceAlt: "#f7e5ff",
    text: "#25204a", textMuted: "#7c76a3", accent: "#ff7ab6", accentContrast: "#ffffff",
    border: "#f2c8ff", danger: "#ff5e6b", success: "#3fbf83",
    gradient: "linear-gradient(135deg,#ff7ab6,#a86bff)",
  },
  motion: { durationMs: 260, easing: "cubic-bezier(.34,1.56,.64,1)", hoverLiftPx: -4, reducedMotionSafe: true },
};

const NEON_CIRCUIT: ThemeBlueprint = {
  id: "neon-circuit",
  name: "Neon Circuit",
  description: "Cyber cyan/magenta on ink; thin borders with outer glow.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Orbitron", "Rajdhani", "Space Grotesk", ui-sans-serif, sans-serif',
    bodyFamily: '"Rajdhani", "Inter", ui-sans-serif, sans-serif',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.333, baseSizePx: 15, headingWeight: 700, bodyWeight: 500,
    headingTracking: "0.06em", headingLineHeight: 1.1, bodyLineHeight: 1.55, headingCase: "uppercase",
  },
  spacing: { step: 8, sectionYPx: 72, gridGapPx: 20, cardPadPx: 20, containerMaxPx: 1280 },
  radius: { sm: "2px", md: "4px", lg: "6px", pill: "9999px" },
  edges: { borderWidthPx: 1, borderStyle: "solid", borderColor: "#22d3ee", dividerStyle: "hairline", outlineOffsetPx: 2 },
  elevation: {
    card: "0 0 0 1px #22d3ee, 0 0 24px -6px rgba(34,211,238,0.55)",
    cardHover: "0 0 0 1px #f0f, 0 0 32px -6px rgba(255,0,255,0.65)",
    overlay: "0 0 80px -20px rgba(34,211,238,0.7)",
    focusRing: "2px solid #f0f",
  },
  layout: "split-hero",
  color: {
    mode: "dark", bg: "#05060b", surface: "#0a0d18", surfaceAlt: "#0f1428",
    text: "#e5f6ff", textMuted: "#7aa3c4", accent: "#22d3ee", accentContrast: "#05060b",
    border: "#22d3ee", danger: "#ff2b6b", success: "#39ff88",
    gradient: "linear-gradient(135deg,#22d3ee,#a855f7)",
  },
  motion: { durationMs: 140, easing: "cubic-bezier(.2,.8,.2,1)", hoverLiftPx: -1, reducedMotionSafe: true },
};

const BRUTAL_SIGNAL: ThemeBlueprint = {
  id: "brutalist-signal",
  name: "Brutalist Signal",
  description: "Warning-tape yellow-on-black, uppercase display, no radius.",
  source: "built-in",
  typePairing: {
    headingFamily: '"Archivo Black", "Space Grotesk", Impact, sans-serif',
    bodyFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeRatio: {
    scale: 1.618, baseSizePx: 16, headingWeight: 900, bodyWeight: 500,
    headingTracking: "-0.02em", headingLineHeight: 0.95, bodyLineHeight: 1.5, headingCase: "uppercase",
  },
  spacing: { step: 8, sectionYPx: 64, gridGapPx: 16, cardPadPx: 20, containerMaxPx: 1440 },
  radius: { sm: "0px", md: "0px", lg: "0px", pill: "0px" },
  edges: { borderWidthPx: 2, borderStyle: "solid", borderColor: "#facc15", dividerStyle: "heavy", outlineOffsetPx: 2 },
  elevation: { card: "none", cardHover: "0 0 0 2px #facc15",
    overlay: "0 0 0 3px #facc15", focusRing: "3px solid #facc15" },
  layout: "poster-brutalist",
  color: {
    mode: "dark", bg: "#0a0a0a", surface: "#111111", surfaceAlt: "#1a1a1a",
    text: "#facc15", textMuted: "#a3a380", accent: "#facc15", accentContrast: "#0a0a0a",
    border: "#facc15", danger: "#ff3b3b", success: "#a3e635",
  },
  motion: { durationMs: 80, easing: "steps(3,end)", hoverLiftPx: 0, reducedMotionSafe: true },
};

export const BUILT_IN_BLUEPRINTS: ThemeBlueprint[] = [
  SWISS, NEO_BRUTAL, TERMINAL, SOFT_CONSUMER, DENSE_OPS,
  LUXE_DARK, CLEAN_SAAS, PLAYFUL_CLAY, NEON_CIRCUIT, BRUTAL_SIGNAL,
];

export function getBuiltIn(id: string): ThemeBlueprint | undefined {
  return BUILT_IN_BLUEPRINTS.find((b) => b.id === id);
}
