// ThemeBlueprint — typed 9-axis theme contract.
// Concrete values only: numbers, css strings, tokens. No mood-only labels.

export type TypePairing = {
  headingFamily: string;   // full CSS font stack for headings
  bodyFamily: string;      // full CSS font stack for body
  monoFamily: string;      // full CSS font stack for mono
  googleFontsHref?: string; // optional <link> to load remote families
};

export type TypeRatio = {
  scale: number;           // modular scale ratio (e.g. 1.125..1.618)
  baseSizePx: number;      // body base
  headingWeight: 300 | 400 | 500 | 600 | 700 | 800 | 900;
  bodyWeight: 300 | 400 | 500 | 600 | 700;
  headingTracking: string; // e.g. "-0.03em"
  headingLineHeight: number; // e.g. 1.05
  bodyLineHeight: number;    // e.g. 1.6
  headingCase: "normal" | "uppercase";
};

export type SpacingDensity = {
  step: number;            // base spacing unit in px (e.g. 4 or 8)
  sectionYPx: number;      // vertical padding for sections (compact 40 → spacious 160)
  gridGapPx: number;
  cardPadPx: number;
  containerMaxPx: number;
};

export type RadiusScale = {
  sm: string;              // e.g. "0px", "6px", "9999px"
  md: string;
  lg: string;
  pill: string;            // for pills / chips
};

export type EdgesTreatment = {
  borderWidthPx: number;   // 0..3
  borderStyle: "solid" | "dashed" | "dotted" | "double";
  borderColor: string;     // color token or literal
  dividerStyle: "hairline" | "heavy" | "double" | "none";
  outlineOffsetPx: number;
};

export type Elevation = {
  // Concrete box-shadow strings. Use "none" to explicitly forbid shadows.
  card: string;
  cardHover: string;
  overlay: string;
  focusRing: string;       // full outline / ring definition
};

export type LayoutArchetype =
  | "single-column-editorial"
  | "asymmetric-magazine"
  | "three-panel-app"
  | "sidebar-dense-ops"
  | "poster-brutalist"
  | "hero-centered-marketing"
  | "terminal-cli"
  | "canvas-modular"
  | "split-hero";

export type ColorStrategy = {
  mode: "light" | "dark";
  // Concrete hex or css color values. Never oklch-only in the blueprint so
  // downstream string-replacement remaps can find literals.
  bg: string;
  surface: string;         // card / panel background
  surfaceAlt: string;      // subtle alt surface
  text: string;            // primary text
  textMuted: string;
  accent: string;          // brand / CTA
  accentContrast: string;  // text on accent
  border: string;
  danger: string;
  success: string;
  gradient?: string;       // optional CSS gradient literal
};

export type MotionProfile = {
  durationMs: number;      // base transition duration
  easing: string;          // e.g. "cubic-bezier(.2,.8,.2,1)"
  hoverLiftPx: number;     // translateY on interactive hover
  reducedMotionSafe: boolean;
};

export type ThemeBlueprint = {
  id: string;              // stable identifier used as marker suffix
  name: string;            // display name
  description: string;     // one-line, factual
  source: "built-in" | "21st.dev";
  // 9 axes
  typePairing: TypePairing;
  typeRatio: TypeRatio;
  spacing: SpacingDensity;
  radius: RadiusScale;
  edges: EdgesTreatment;
  elevation: Elevation;
  layout: LayoutArchetype;
  color: ColorStrategy;
  motion: MotionProfile;
};

/** Compact vector used for uniqueness / Surprise-Me distance. Non-color axes
 *  dominate so tests can require difference in structure, not just palette. */
export type StyleSignature = {
  id: string;
  // structural / non-color
  layout: LayoutArchetype;
  typeHead: string;        // first family in headingFamily
  typeBody: string;
  ratio: number;
  headingWeight: number;
  headingCase: "normal" | "uppercase";
  step: number;
  sectionY: number;
  radiusMdPx: number;      // parsed radius.md
  borderWidth: number;
  hasShadow: boolean;      // elevation.card !== "none"
  motionDuration: number;
  hoverLift: number;
  // color (weighted lower)
  mode: "light" | "dark";
  accentHue: number;       // 0..360 (from hex)
};
