// Local reusable component library. Private, per-browser, safe-storage backed
// at the call site. Pure data model here.

export type ComponentEntry = {
  id: string;
  name: string;
  html: string;
  css?: string;
  tags: string[];
  dependencies: string[];
  validationStatus: "unchecked" | "passed" | "warnings" | "failed";
  createdAt: number;
  updatedAt: number;
};

const MAX_NAME = 60;
const MAX_HTML = 200_000;

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
}
function safeName(s: string): string {
  return (s || "").trim().replace(/[\x00-\x1f]/g, "").slice(0, MAX_NAME) || "Component";
}

export function createComponent(list: ComponentEntry[], input: { name: string; html: string; css?: string; tags?: string[]; dependencies?: string[] }): { ok: true; list: ComponentEntry[]; id: string } | { ok: false; error: string } {
  if (!input.html || input.html.length > MAX_HTML) return { ok: false, error: "invalid html size" };
  if (list.some((c) => c.name.toLowerCase() === safeName(input.name).toLowerCase())) return { ok: false, error: "name exists" };
  const now = Date.now();
  const c: ComponentEntry = {
    id: uid(),
    name: safeName(input.name),
    html: input.html.slice(0, MAX_HTML),
    css: input.css?.slice(0, MAX_HTML),
    tags: (input.tags ?? []).slice(0, 10).map((t) => safeName(t)),
    dependencies: (input.dependencies ?? []).slice(0, 20),
    validationStatus: "unchecked",
    createdAt: now, updatedAt: now,
  };
  return { ok: true, list: [...list, c], id: c.id };
}

export function renameComponent(list: ComponentEntry[], id: string, name: string): ComponentEntry[] {
  const n = safeName(name);
  return list.map((c) => c.id === id ? { ...c, name: n, updatedAt: Date.now() } : c);
}
export function deleteComponent(list: ComponentEntry[], id: string): ComponentEntry[] {
  return list.filter((c) => c.id !== id);
}
export function duplicateComponent(list: ComponentEntry[], id: string): ComponentEntry[] {
  const src = list.find((c) => c.id === id); if (!src) return list;
  let n = 1; let name = `${src.name} copy`;
  while (list.some((c) => c.name === name)) { n++; name = `${src.name} copy ${n}`; }
  return [...list, { ...src, id: uid(), name, createdAt: Date.now(), updatedAt: Date.now() }];
}

/** Emit a self-contained HTML fragment for insertion into a document. */
export function insertMarkup(c: ComponentEntry): string {
  return c.css ? `<style>${c.css}</style>\n${c.html}` : c.html;
}
