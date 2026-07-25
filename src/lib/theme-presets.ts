// Curated preset themes for the sandbox Themes panel. These are always
// available (no API required) and are intentionally distinctive so users see
// real variety rather than palette variations of the same amber house style.

export type ThemePreset = {
  identifier: string;
  name: string;
  description: string;
  author?: string;
  colors: string[]; // swatch order: bg, surface, primary, accent, fg, border
  fontImport?: string; // <link> href appended once
  css: string; // full :root block + body rules
};

const G_INTER = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
const G_SPACE = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap";
const G_SERIF = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap";
const G_MONO = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap";
const G_DMSERIF = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&display=swap";
const G_OUTFIT = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&family=Figtree:wght@400;500;600&display=swap";
const G_ARCHIVO = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap";
const G_MONO_JB = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap";

function block(vars: Record<string, string>, opts: { fontSans?: string; fontSerif?: string; fontMono?: string; bodyExtra?: string } = {}): string {
  const lines = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join("\n");
  const fontDecls: string[] = [];
  if (opts.fontSans) fontDecls.push(`  --font-sans: ${opts.fontSans};`);
  if (opts.fontSerif) fontDecls.push(`  --font-serif: ${opts.fontSerif};`);
  if (opts.fontMono) fontDecls.push(`  --font-mono: ${opts.fontMono};`);
  return `:root {\n${lines}\n${fontDecls.join("\n")}\n}\nbody { background: var(--background); color: var(--foreground); ${opts.fontSans ? `font-family: var(--font-sans);` : ""} ${opts.bodyExtra ?? ""} }\nh1,h2,h3,h4 { ${opts.fontSerif ? `font-family: var(--font-serif);` : opts.fontSans ? `font-family: var(--font-sans);` : ""} }\ncode,pre,kbd { ${opts.fontMono ? `font-family: var(--font-mono);` : ""} }\n`;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    identifier: "preset/obsidian-amber",
    name: "Obsidian Amber",
    description: "The house style — deep black canvas with molten amber accents.",
    colors: ["#030405", "#111317", "#F4A125", "#DD9324", "#f2eee7", "rgba(244,161,37,0.22)"],
    fontImport: G_SPACE,
    css: block({
      background: "#030405", foreground: "#f2eee7",
      card: "#111317", "card-foreground": "#f2eee7",
      primary: "#F4A125", "primary-foreground": "#111317",
      secondary: "#1a1d24", "secondary-foreground": "#f2eee7",
      accent: "#DD9324", "accent-foreground": "#111317",
      muted: "#111317", "muted-foreground": "#B6BCC8",
      border: "rgba(244,161,37,0.22)", ring: "#F4A125", radius: "0.75rem",
    }, { fontSans: "'Space Grotesk', system-ui, sans-serif", fontMono: "'JetBrains Mono', monospace" }),
  },
  {
    identifier: "preset/nordic-ice",
    name: "Nordic Ice",
    description: "Cold blue-grays, glacial minimalism.",
    colors: ["#0f1419", "#1a2028", "#88c0d0", "#5e81ac", "#eceff4", "#3b4252"],
    fontImport: G_INTER,
    css: block({
      background: "#0f1419", foreground: "#eceff4",
      card: "#1a2028", "card-foreground": "#eceff4",
      primary: "#88c0d0", "primary-foreground": "#0f1419",
      secondary: "#2e3440", "secondary-foreground": "#eceff4",
      accent: "#5e81ac", "accent-foreground": "#eceff4",
      muted: "#2e3440", "muted-foreground": "#a3b1c2",
      border: "#3b4252", ring: "#88c0d0", radius: "0.5rem",
    }, { fontSans: "Inter, system-ui, sans-serif" }),
  },
  {
    identifier: "preset/tokyo-neon",
    name: "Tokyo Neon",
    description: "Cyberpunk magenta + cyan on ink black.",
    colors: ["#0a0014", "#160a2e", "#ff2e97", "#00e5ff", "#f7f7ff", "#3a1c5e"],
    fontImport: G_SPACE,
    css: block({
      background: "#0a0014", foreground: "#f7f7ff",
      card: "#160a2e", "card-foreground": "#f7f7ff",
      primary: "#ff2e97", "primary-foreground": "#0a0014",
      secondary: "#241246", "secondary-foreground": "#f7f7ff",
      accent: "#00e5ff", "accent-foreground": "#0a0014",
      muted: "#1a0f33", "muted-foreground": "#b7a9d9",
      border: "#3a1c5e", ring: "#00e5ff", radius: "0.25rem",
    }, { fontSans: "'Space Grotesk', system-ui, sans-serif", fontMono: "'JetBrains Mono', monospace" }),
  },
  {
    identifier: "preset/paper-editorial",
    name: "Paper Editorial",
    description: "Warm cream, serif headlines — magazine feel.",
    colors: ["#f6f1e8", "#ffffff", "#1a1a1a", "#b8541f", "#2b2b2b", "#d9cfbe"],
    fontImport: G_SERIF,
    css: block({
      background: "#f6f1e8", foreground: "#1a1a1a",
      card: "#ffffff", "card-foreground": "#1a1a1a",
      primary: "#1a1a1a", "primary-foreground": "#f6f1e8",
      secondary: "#efe6d4", "secondary-foreground": "#2b2b2b",
      accent: "#b8541f", "accent-foreground": "#f6f1e8",
      muted: "#eee6d3", "muted-foreground": "#6b6355",
      border: "#d9cfbe", ring: "#b8541f", radius: "0.375rem",
    }, { fontSans: "Inter, system-ui, sans-serif", fontSerif: "'Fraunces', Georgia, serif" }),
  },
  {
    identifier: "preset/matrix-terminal",
    name: "Matrix Terminal",
    description: "Green phosphor on jet black — pure hacker CRT.",
    colors: ["#000000", "#050f05", "#39ff14", "#00b34a", "#c8ffcf", "#0d3b12"],
    fontImport: G_MONO_JB,
    css: block({
      background: "#000000", foreground: "#c8ffcf",
      card: "#050f05", "card-foreground": "#c8ffcf",
      primary: "#39ff14", "primary-foreground": "#000000",
      secondary: "#0a1f0a", "secondary-foreground": "#c8ffcf",
      accent: "#00b34a", "accent-foreground": "#000000",
      muted: "#08170a", "muted-foreground": "#68a870",
      border: "#0d3b12", ring: "#39ff14", radius: "0.125rem",
    }, { fontSans: "'JetBrains Mono', monospace", fontMono: "'JetBrains Mono', monospace" }),
  },
  {
    identifier: "preset/rose-blush",
    name: "Rose Blush",
    description: "Soft pinks, cream backgrounds, calm and warm.",
    colors: ["#fff5f5", "#ffffff", "#e11d74", "#f472b6", "#3d1a2b", "#fbcfe8"],
    fontImport: G_DMSERIF,
    css: block({
      background: "#fff5f5", foreground: "#3d1a2b",
      card: "#ffffff", "card-foreground": "#3d1a2b",
      primary: "#e11d74", "primary-foreground": "#ffffff",
      secondary: "#ffe4ee", "secondary-foreground": "#3d1a2b",
      accent: "#f472b6", "accent-foreground": "#3d1a2b",
      muted: "#ffe9f1", "muted-foreground": "#8a5a72",
      border: "#fbcfe8", ring: "#e11d74", radius: "1rem",
    }, { fontSans: "'DM Sans', system-ui, sans-serif", fontSerif: "'DM Serif Display', Georgia, serif" }),
  },
  {
    identifier: "preset/brutalist-mono",
    name: "Brutalist Mono",
    description: "High-contrast black/white with a hazard yellow.",
    colors: ["#ffffff", "#f5f5f5", "#000000", "#ffde00", "#000000", "#000000"],
    fontImport: G_ARCHIVO,
    css: block({
      background: "#ffffff", foreground: "#000000",
      card: "#f5f5f5", "card-foreground": "#000000",
      primary: "#000000", "primary-foreground": "#ffde00",
      secondary: "#e5e5e5", "secondary-foreground": "#000000",
      accent: "#ffde00", "accent-foreground": "#000000",
      muted: "#efefef", "muted-foreground": "#333333",
      border: "#000000", ring: "#000000", radius: "0rem",
    }, { fontSans: "Archivo, system-ui, sans-serif", fontSerif: "'Archivo Black', Impact, sans-serif" }),
  },
  {
    identifier: "preset/deep-ocean",
    name: "Deep Ocean",
    description: "Abyssal navy with teal bioluminescence.",
    colors: ["#020617", "#0b1220", "#22d3ee", "#0ea5e9", "#e2e8f0", "#164e63"],
    fontImport: G_OUTFIT,
    css: block({
      background: "#020617", foreground: "#e2e8f0",
      card: "#0b1220", "card-foreground": "#e2e8f0",
      primary: "#22d3ee", "primary-foreground": "#020617",
      secondary: "#0f172a", "secondary-foreground": "#e2e8f0",
      accent: "#0ea5e9", "accent-foreground": "#020617",
      muted: "#0f172a", "muted-foreground": "#94a3b8",
      border: "#164e63", ring: "#22d3ee", radius: "0.625rem",
    }, { fontSans: "Outfit, system-ui, sans-serif" }),
  },
  {
    identifier: "preset/forest-moss",
    name: "Forest Moss",
    description: "Earthy greens, aged parchment — botanical, calm.",
    colors: ["#1a2a1e", "#243428", "#8fbc8f", "#c9b57a", "#e8e2d0", "#3d5240"],
    fontImport: G_SERIF,
    css: block({
      background: "#1a2a1e", foreground: "#e8e2d0",
      card: "#243428", "card-foreground": "#e8e2d0",
      primary: "#8fbc8f", "primary-foreground": "#1a2a1e",
      secondary: "#2e402f", "secondary-foreground": "#e8e2d0",
      accent: "#c9b57a", "accent-foreground": "#1a2a1e",
      muted: "#2a3a2c", "muted-foreground": "#b7c0a9",
      border: "#3d5240", ring: "#c9b57a", radius: "0.75rem",
    }, { fontSans: "Inter, system-ui, sans-serif", fontSerif: "'Fraunces', Georgia, serif" }),
  },
  {
    identifier: "preset/sunset-vapor",
    name: "Sunset Vapor",
    description: "Miami vaporwave — magenta-to-orange gradients.",
    colors: ["#1a0033", "#2d0052", "#ff6ec7", "#ffb347", "#ffffff", "#7c3aed"],
    fontImport: G_SPACE,
    css: block({
      background: "#1a0033", foreground: "#ffffff",
      card: "#2d0052", "card-foreground": "#ffffff",
      primary: "#ff6ec7", "primary-foreground": "#1a0033",
      secondary: "#3b0e6b", "secondary-foreground": "#ffffff",
      accent: "#ffb347", "accent-foreground": "#1a0033",
      muted: "#2a0648", "muted-foreground": "#d9c7ff",
      border: "#7c3aed", ring: "#ff6ec7", radius: "1rem",
    }, { fontSans: "'Space Grotesk', system-ui, sans-serif" }),
  },
  {
    identifier: "preset/mono-plex",
    name: "IBM Plex Mono",
    description: "Slate/graphite with technical Plex typography.",
    colors: ["#12151a", "#1a1e26", "#3b82f6", "#a78bfa", "#e5e7eb", "#2b313a"],
    fontImport: G_MONO,
    css: block({
      background: "#12151a", foreground: "#e5e7eb",
      card: "#1a1e26", "card-foreground": "#e5e7eb",
      primary: "#3b82f6", "primary-foreground": "#ffffff",
      secondary: "#242a34", "secondary-foreground": "#e5e7eb",
      accent: "#a78bfa", "accent-foreground": "#12151a",
      muted: "#1e242d", "muted-foreground": "#9aa4b2",
      border: "#2b313a", ring: "#3b82f6", radius: "0.375rem",
    }, { fontSans: "'IBM Plex Sans', system-ui, sans-serif", fontMono: "'IBM Plex Mono', monospace" }),
  },
  {
    identifier: "preset/copper-noir",
    name: "Copper Noir",
    description: "Charcoal with burnished copper — cinematic, moody.",
    colors: ["#141210", "#1e1a17", "#b87333", "#e8a87c", "#f4ede4", "#3a2e26"],
    fontImport: G_SERIF,
    css: block({
      background: "#141210", foreground: "#f4ede4",
      card: "#1e1a17", "card-foreground": "#f4ede4",
      primary: "#b87333", "primary-foreground": "#141210",
      secondary: "#28221e", "secondary-foreground": "#f4ede4",
      accent: "#e8a87c", "accent-foreground": "#141210",
      muted: "#221d19", "muted-foreground": "#b8ad9f",
      border: "#3a2e26", ring: "#b87333", radius: "0.5rem",
    }, { fontSans: "Inter, system-ui, sans-serif", fontSerif: "'Fraunces', Georgia, serif" }),
  },
  {
    identifier: "preset/citrus-pop",
    name: "Citrus Pop",
    description: "Zesty lime + tangerine on off-white.",
    colors: ["#fefce8", "#ffffff", "#84cc16", "#f97316", "#1a2e05", "#d9f99d"],
    fontImport: G_OUTFIT,
    css: block({
      background: "#fefce8", foreground: "#1a2e05",
      card: "#ffffff", "card-foreground": "#1a2e05",
      primary: "#84cc16", "primary-foreground": "#1a2e05",
      secondary: "#ecfccb", "secondary-foreground": "#1a2e05",
      accent: "#f97316", "accent-foreground": "#ffffff",
      muted: "#f7f5d4", "muted-foreground": "#556b2f",
      border: "#d9f99d", ring: "#84cc16", radius: "1.25rem",
    }, { fontSans: "Outfit, system-ui, sans-serif" }),
  },
  {
    identifier: "preset/midnight-royal",
    name: "Midnight Royal",
    description: "Deep indigo with gold-leaf accents — regal.",
    colors: ["#0a0e27", "#141a3a", "#fbbf24", "#818cf8", "#f8fafc", "#2d3561"],
    fontImport: G_DMSERIF,
    css: block({
      background: "#0a0e27", foreground: "#f8fafc",
      card: "#141a3a", "card-foreground": "#f8fafc",
      primary: "#fbbf24", "primary-foreground": "#0a0e27",
      secondary: "#1f2749", "secondary-foreground": "#f8fafc",
      accent: "#818cf8", "accent-foreground": "#0a0e27",
      muted: "#1a2145", "muted-foreground": "#a5b0d1",
      border: "#2d3561", ring: "#fbbf24", radius: "0.5rem",
    }, { fontSans: "'DM Sans', system-ui, sans-serif", fontSerif: "'DM Serif Display', Georgia, serif" }),
  },
];

export function findPreset(identifier: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.identifier === identifier);
}
