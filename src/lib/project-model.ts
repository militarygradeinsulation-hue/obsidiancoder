// Backward-compatible multi-file project model. Existing sessions store a
// single `html` string; a Project wraps that as one executable file plus an
// optional file tree. Preview always runs from the executable entry file.
// Pure data model — no side effects.

export type FileKind = "html" | "css" | "js" | "json" | "md" | "text" | "svg" | "asset";

export type ProjectFile = {
  id: string;
  path: string;             // e.g. "index.html", "assets/logo.svg"
  kind: FileKind;
  content: string;
  protected?: boolean;      // create/rename/delete blocked
  executable?: boolean;     // rendered in the preview iframe
  createdAt: number;
  updatedAt: number;
};

export type Project = {
  version: 1;
  entryFileId: string;      // one executable file (usually index.html)
  files: ProjectFile[];
};

export const PROJECT_VERSION = 1 as const;
const MAX_PATH = 200;
const MAX_FILES = 128;

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
}

export function inferKind(path: string): FileKind {
  const ext = path.toLowerCase().split(".").pop() || "";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "css") return "css";
  if (ext === "js" || ext === "mjs" || ext === "ts") return "js";
  if (ext === "json") return "json";
  if (ext === "md") return "md";
  if (ext === "svg") return "svg";
  return "text";
}

/** Migrate a legacy single-HTML session into a Project without data loss. */
export function migrateFromHtml(html: string): Project {
  const now = Date.now();
  const entry: ProjectFile = {
    id: uid(),
    path: "index.html",
    kind: "html",
    content: html ?? "",
    protected: true,
    executable: true,
    createdAt: now,
    updatedAt: now,
  };
  return { version: PROJECT_VERSION, entryFileId: entry.id, files: [entry] };
}

export function isProject(x: unknown): x is Project {
  return !!x && typeof x === "object" && (x as Project).version === PROJECT_VERSION && Array.isArray((x as Project).files);
}

export function getEntry(p: Project): ProjectFile | undefined {
  return p.files.find((f) => f.id === p.entryFileId);
}

export function validatePath(path: string): { ok: true } | { ok: false; error: string } {
  if (!path || typeof path !== "string") return { ok: false, error: "empty path" };
  if (path.length > MAX_PATH) return { ok: false, error: "path too long" };
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return { ok: false, error: "invalid path" };
  if (/[\x00-\x1f<>:"|?*]/.test(path)) return { ok: false, error: "illegal chars" };
  return { ok: true };
}

export function createFile(p: Project, path: string, content = ""): { ok: true; project: Project; fileId: string } | { ok: false; error: string } {
  const v = validatePath(path); if (!v.ok) return v;
  if (p.files.length >= MAX_FILES) return { ok: false, error: "file limit reached" };
  if (p.files.some((f) => f.path === path)) return { ok: false, error: "path exists" };
  const now = Date.now();
  const f: ProjectFile = { id: uid(), path, kind: inferKind(path), content, createdAt: now, updatedAt: now };
  return { ok: true, project: { ...p, files: [...p.files, f] }, fileId: f.id };
}

export function renameFile(p: Project, id: string, newPath: string): { ok: true; project: Project } | { ok: false; error: string } {
  const target = p.files.find((f) => f.id === id);
  if (!target) return { ok: false, error: "not found" };
  if (target.protected) return { ok: false, error: "file is protected" };
  const v = validatePath(newPath); if (!v.ok) return v;
  if (p.files.some((f) => f.path === newPath && f.id !== id)) return { ok: false, error: "path exists" };
  return { ok: true, project: { ...p, files: p.files.map((f) => f.id === id ? { ...f, path: newPath, kind: inferKind(newPath), updatedAt: Date.now() } : f) } };
}

export function duplicateFile(p: Project, id: string): { ok: true; project: Project; fileId: string } | { ok: false; error: string } {
  const src = p.files.find((f) => f.id === id);
  if (!src) return { ok: false, error: "not found" };
  if (p.files.length >= MAX_FILES) return { ok: false, error: "file limit reached" };
  const base = src.path.replace(/(\.[^./]+)?$/, "");
  const ext = src.path.slice(base.length);
  let n = 1; let candidate = `${base}-copy${ext}`;
  while (p.files.some((f) => f.path === candidate)) { n++; candidate = `${base}-copy-${n}${ext}`; }
  const now = Date.now();
  const copy: ProjectFile = { ...src, id: uid(), path: candidate, protected: false, executable: false, createdAt: now, updatedAt: now };
  return { ok: true, project: { ...p, files: [...p.files, copy] }, fileId: copy.id };
}

export function deleteFile(p: Project, id: string): { ok: true; project: Project } | { ok: false; error: string } {
  const target = p.files.find((f) => f.id === id);
  if (!target) return { ok: false, error: "not found" };
  if (target.protected) return { ok: false, error: "file is protected" };
  if (id === p.entryFileId) return { ok: false, error: "cannot delete entry file" };
  return { ok: true, project: { ...p, files: p.files.filter((f) => f.id !== id) } };
}

export function updateContent(p: Project, id: string, content: string): Project {
  return { ...p, files: p.files.map((f) => f.id === id ? { ...f, content, updatedAt: Date.now() } : f) };
}

/** Serializable project export (safe for JSON). */
export function toJSON(p: Project): string {
  return JSON.stringify({ ...p, exportedAt: Date.now() }, null, 2);
}
