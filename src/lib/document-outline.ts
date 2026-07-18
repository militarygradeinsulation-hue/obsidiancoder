// Compact document outline — smaller AI context than sending the whole HTML.
// Pure regex; not a DOM parser. Never evaluates scripts.

export type DocumentOutline = {
  title: string | null;
  ids: string[];
  headings: { level: number; text: string; id: string | null }[];
  buttons: { text: string; id: string | null }[];
  links: { text: string; href: string; id: string | null }[];
  images: { alt: string; src: string; id: string | null }[];
  forms: { id: string | null; action: string | null; fields: number }[];
  styleBlocks: number;
  scriptBlocks: number;
  totalChars: number;
};

function idOf(openTag: string): string | null {
  const m = openTag.match(/\bid\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : null;
}
function attr(openTag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = openTag.match(re);
  return m ? m[1] : null;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function extractOutline(html: string): DocumentOutline {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;

  const ids: string[] = [];
  const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(html))) ids.push(m[1]);

  const headings: DocumentOutline["headings"] = [];
  const hRe = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  while ((m = hRe.exec(html))) {
    headings.push({ level: Number(m[1]), text: stripTags(m[3]).slice(0, 120), id: idOf(m[0]) });
  }

  const buttons: DocumentOutline["buttons"] = [];
  const bRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((m = bRe.exec(html))) {
    buttons.push({ text: stripTags(m[2]).slice(0, 80), id: idOf(m[0]) });
  }

  const links: DocumentOutline["links"] = [];
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = aRe.exec(html))) {
    links.push({ text: stripTags(m[2]).slice(0, 80), href: attr(m[0], "href") ?? "", id: idOf(m[0]) });
  }

  const images: DocumentOutline["images"] = [];
  const imgRe = /<img\b([^>]*)>/gi;
  while ((m = imgRe.exec(html))) {
    images.push({ alt: attr(m[0], "alt") ?? "", src: (attr(m[0], "src") ?? "").slice(0, 120), id: idOf(m[0]) });
  }

  const forms: DocumentOutline["forms"] = [];
  const fRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  while ((m = fRe.exec(html))) {
    const fields = (m[2].match(/<(input|select|textarea)\b/gi) ?? []).length;
    forms.push({ id: idOf(m[0]), action: attr(m[0], "action"), fields });
  }

  const styleBlocks = (html.match(/<style\b/gi) ?? []).length;
  const scriptBlocks = (html.match(/<script\b/gi) ?? []).length;

  return {
    title,
    ids: Array.from(new Set(ids)).slice(0, 200),
    headings: headings.slice(0, 40),
    buttons: buttons.slice(0, 40),
    links: links.slice(0, 40),
    images: images.slice(0, 40),
    forms: forms.slice(0, 20),
    styleBlocks,
    scriptBlocks,
    totalChars: html.length,
  };
}

/** Compact, model-friendly outline string. */
export function outlineToPrompt(o: DocumentOutline): string {
  const lines: string[] = [];
  lines.push(`title: ${o.title ?? "(none)"}`);
  lines.push(`totalChars: ${o.totalChars}, style blocks: ${o.styleBlocks}, script blocks: ${o.scriptBlocks}`);
  if (o.ids.length) lines.push(`ids: ${o.ids.slice(0, 60).join(", ")}`);
  if (o.headings.length) {
    lines.push("headings:");
    o.headings.forEach((h) => lines.push(`  h${h.level}${h.id ? `#${h.id}` : ""}: ${h.text}`));
  }
  if (o.buttons.length) {
    lines.push("buttons:");
    o.buttons.forEach((b) => lines.push(`  button${b.id ? `#${b.id}` : ""}: "${b.text}"`));
  }
  if (o.links.length) {
    lines.push("links:");
    o.links.slice(0, 20).forEach((l) => lines.push(`  a${l.id ? `#${l.id}` : ""} → ${l.href}: "${l.text}"`));
  }
  if (o.images.length) {
    lines.push("images:");
    o.images.slice(0, 20).forEach((i) => lines.push(`  img${i.id ? `#${i.id}` : ""} alt="${i.alt}" src=${i.src}`));
  }
  if (o.forms.length) {
    lines.push("forms:");
    o.forms.forEach((f) => lines.push(`  form${f.id ? `#${f.id}` : ""} action=${f.action ?? "(none)"} fields=${f.fields}`));
  }
  return lines.join("\n");
}
