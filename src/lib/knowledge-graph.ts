// Deterministic project knowledge graph. Parses a single HTML document (the
// current executable preview) and extracts a compact structural inventory:
// ids, selectors, scripts, styles, assets, routes, endpoints, env refs,
// dependencies inferred from CDN URLs, and integration hints. Pure, no AI.

export type KnowledgeGraph = {
  ids: string[];
  classes: string[];
  buttons: { id?: string; text: string; hasHandler: boolean }[];
  links: { href: string; text: string; external: boolean; broken: boolean }[];
  images: { src: string; alt: string | null }[];
  scripts: { src?: string; inline: boolean; async?: boolean; defer?: boolean }[];
  styles: { href?: string; inline: boolean }[];
  endpoints: string[];
  envRefs: string[];
  dependencies: string[];
  integrations: string[];
  meta: { hasViewport: boolean; hasTitle: boolean; hasDescription: boolean; hasLang: boolean };
  size: number;
  nodeCount: number;
};

const CDN_MAP: [RegExp, string][] = [
  [/cdn\.jsdelivr\.net\/npm\/([@\w./-]+)/g, "$1"],
  [/unpkg\.com\/([@\w./-]+)/g, "$1"],
  [/esm\.sh\/([@\w./-]+)/g, "$1"],
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/([\w.-]+)/g, "$1"],
];
const INTEGRATION_HINTS: [RegExp, string][] = [
  [/supabase/i, "Supabase"],
  [/stripe/i, "Stripe"],
  [/firebase/i, "Firebase"],
  [/clerk/i, "Clerk"],
  [/resend/i, "Resend"],
  [/openai/i, "OpenAI"],
  [/anthropic/i, "Anthropic"],
  [/gemini|generativelanguage/i, "Gemini"],
  [/vercel/i, "Vercel"],
  [/github/i, "GitHub"],
];

export function buildGraph(html: string): KnowledgeGraph {
  if (typeof html !== "string") html = "";
  const ids = uniq(matchAll(html, /\bid=["']([^"']+)["']/g).map((m) => m[1]));
  const classes = uniq(
    matchAll(html, /\bclass=["']([^"']+)["']/g)
      .flatMap((m) => m[1].split(/\s+/))
      .filter(Boolean),
  ).slice(0, 200);

  const buttons = matchAll(html, /<button\b([^>]*)>([\s\S]*?)<\/button>/gi).map((m) => {
    const attrs = m[1] || "";
    const text = stripTags(m[2]).trim().slice(0, 80);
    const id = /\bid=["']([^"']+)["']/.exec(attrs)?.[1];
    const hasHandler = /\bon\w+=/.test(attrs) || /\bdata-[a-z-]+/.test(attrs);
    return { id, text, hasHandler };
  });

  const links = matchAll(html, /<a\b([^>]*)>([\s\S]*?)<\/a>/gi).map((m) => {
    const attrs = m[1] || "";
    const href = /\bhref=["']([^"']*)["']/.exec(attrs)?.[1] ?? "";
    const text = stripTags(m[2]).trim().slice(0, 80);
    const external = /^https?:\/\//.test(href);
    const broken = !href || href === "#" || href.trim() === "";
    return { href, text, external, broken };
  });

  const images = matchAll(html, /<img\b([^>]*)>/gi).map((m) => {
    const attrs = m[1] || "";
    const src = /\bsrc=["']([^"']*)["']/.exec(attrs)?.[1] ?? "";
    const altMatch = /\balt=["']([^"']*)["']/.exec(attrs);
    return { src, alt: altMatch ? altMatch[1] : null };
  });

  const scripts = matchAll(html, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi).map((m) => {
    const attrs = m[1] || "";
    const src = /\bsrc=["']([^"']*)["']/.exec(attrs)?.[1];
    return {
      src,
      inline: !src && !!m[2].trim(),
      async: /\basync\b/.test(attrs),
      defer: /\bdefer\b/.test(attrs),
    };
  });

  const styles: KnowledgeGraph["styles"] = [];
  for (const m of matchAll(html, /<link\b([^>]*rel=["']stylesheet["'][^>]*)>/gi)) {
    const href = /\bhref=["']([^"']*)["']/.exec(m[1])?.[1];
    styles.push({ href, inline: false });
  }
  for (const _ of matchAll(html, /<style\b[^>]*>[\s\S]*?<\/style>/gi)) {
    styles.push({ inline: true });
  }

  const endpoints = uniq(
    matchAll(html, /\bfetch\(\s*["']([^"']+)["']/g)
      .map((m) => m[1])
      .concat(matchAll(html, /\baxios\.[a-z]+\(\s*["']([^"']+)["']/gi).map((m) => m[1])),
  ).slice(0, 40);

  const envRefs = uniq(
    matchAll(html, /(?:process\.env|import\.meta\.env)\.([A-Z0-9_]+)/g).map((m) => m[1]),
  );

  const dependencies = uniq(
    scripts
      .concat(styles.map((s) => ({ src: s.href })) as never)
      .flatMap((s: { src?: string }) => {
        const src = s.src;
        if (!src) return [];
        const out: string[] = [];
        for (const [rx] of CDN_MAP) {
          rx.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = rx.exec(src))) out.push(m[1].split("@")[0].replace(/^\/+/, ""));
        }
        return out;
      }),
  ).slice(0, 40);

  const integrations = uniq(
    INTEGRATION_HINTS.filter(([rx]) => rx.test(html)).map(([, name]) => name),
  );

  return {
    ids,
    classes,
    buttons,
    links,
    images,
    scripts,
    styles,
    endpoints,
    envRefs,
    dependencies,
    integrations,
    meta: {
      hasViewport: /<meta[^>]*name=["']viewport["']/i.test(html),
      hasTitle: /<title>[\s\S]*?<\/title>/i.test(html),
      hasDescription: /<meta[^>]*name=["']description["']/i.test(html),
      hasLang: /<html[^>]*\blang=/i.test(html),
    },
    size: html.length,
    nodeCount: (html.match(/<[a-z][^>]*>/gi) || []).length,
  };
}

function matchAll(s: string, rx: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const r = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(s))) { out.push(m); if (m.index === r.lastIndex) r.lastIndex++; }
  return out;
}
function uniq<T>(a: T[]): T[] { return Array.from(new Set(a)); }
function stripTags(s: string): string { return s.replace(/<[^>]+>/g, ""); }
