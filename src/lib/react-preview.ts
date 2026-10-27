// An in-browser *preview* compiler, never a production build.
// Every generated module runs in an opaque-origin sandbox iframe. The parent
// performs TypeScript syntax transpilation only and never executes app source.
import type { FullAppFiles } from "./full-app-scaffold";

export const PREVIEW_MAX_FILES = 70;
export const PREVIEW_MAX_SOURCE = 350_000;
export const PREVIEW_ROOT = "src/main.tsx";
const PREFIX = "@obsidian-preview/";

export interface ReactPreviewResult {
  html: string;
  fileCount: number;
  warnings: string[];
}

const CDN_MODULES: Record<string, string> = {
  "react": "https://esm.sh/react@19.2.0",
  "react/jsx-runtime": "https://esm.sh/react@19.2.0/jsx-runtime",
  "react/jsx-dev-runtime": "https://esm.sh/react@19.2.0/jsx-dev-runtime",
  "react-dom": "https://esm.sh/react-dom@19.2.0?external=react",
  "react-dom/client": "https://esm.sh/react-dom@19.2.0/client?external=react",
  "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.110.5",
  "lucide-react": "https://esm.sh/lucide-react@0.575.0?external=react",
};
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".json", ".css"];
const JSX_SRC = /\.(?:tsx|jsx)$/i;
const JS_SRC = /\.(?:ts|tsx|js|jsx)$/i;

export function resolvePreviewImport(
  sourcePath: string, specifier: string, files: FullAppFiles,
): string {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    if (CDN_MODULES[specifier]) return specifier;
    throw new Error("Preview package is not supported: " + specifier);
  }
  if (!sourcePath.startsWith("src/")) throw new Error("Invalid import location.");
  const segments = specifier.startsWith("@/")
    ? ["src", ...specifier.slice(2).split("/")]
    : [...sourcePath.split("/").slice(0, -1), ...specifier.split("/")];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length < 2) throw new Error("Import escapes app source.");
      normalized.pop();
    } else normalized.push(segment);
  }
  const stem = normalized.join("/");
  if (!stem.startsWith("src/")) throw new Error("Import escapes app source.");
  const candidates = [stem, ...EXTENSIONS.map((x) => stem + x),
    ...EXTENSIONS.map((x) => stem + "/index" + x)];
  const found = candidates.find((p) => Object.hasOwn(files, p));
  if (!found) throw new Error("Import not found: " + specifier + " (in " + sourcePath + ")");
  return PREFIX + found;
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function jsonScript(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
function toDataUrl(code: string): string {
  const bytes = new TextEncoder().encode(code);
  // Avoid stack overflow for large files and preserve all Unicode.
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    encoded += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return "data:text/javascript;base64," + btoa(encoded);
}
export function preparePreviewSources(files: FullAppFiles): {
  files: Record<string, string>;
  css: string;
  warnings: string[];
} {
  if (!files || typeof files !== "object" || !Object.hasOwn(files, PREVIEW_ROOT))
    throw new Error("App does not contain src/main.tsx.");
  const sources = Object.entries(files).filter(([p]) => p.startsWith("src/") && (JS_SRC.test(p) || p.endsWith(".json") || p.endsWith(".css")));
  if (sources.length > PREVIEW_MAX_FILES) throw new Error("Preview exceeds the 70-source-file limit.");
  const size = sources.reduce((sum, [, value]) => sum + value.length, 0);
  if (size > PREVIEW_MAX_SOURCE) throw new Error("Preview source is too large for browser compilation.");
  const warnings: string[] = [];
  const css = sources.filter(([p]) => p.endsWith(".css")).map(([p, s]) =>
    "/* " + p.replace(/\*\//g, "") + " */\n" + s).join("\n");
  // CSS is injected as a stylesheet. The production Vite build may support
  // extra bundler features (CSS modules/assets) that this preview does not.
  if (sources.some(([p]) => p.endsWith(".module.css"))) warnings.push("CSS modules require a production build.");
  return {
    files: Object.fromEntries(sources.filter(([p]) => !p.endsWith(".css"))),
    css,
    warnings,
  };
}
function rewriteModuleImports(path: string, js: string, files: FullAppFiles): string {
  // TypeScript already stripped TypeScript syntax. Only *literal* import
  // specifiers are supported. Dynamic computed imports are intentionally
  // excluded rather than trying to execute arbitrary bundler plugins.
  return js
    .replace(/(?:^|\n)\s*import\s*["']([^"']+\.css)["'];?/g, (_all, spec: string) => {
      const resolved = resolvePreviewImport(path, spec, files);
      if (!resolved.endsWith(".css")) throw new Error("CSS import resolved to a non-CSS file.");
      return "\n";
    })
    .replace(/(\bfrom\s*["']|\bimport\s*\(\s*["']|\bimport\s*["'])([^"']+)(["'])/g,
      (_all, before: string, spec: string, after: string) => {
        if (!spec.startsWith(".") && !spec.startsWith("@/") && !CDN_MODULES[spec])
          throw new Error("Unsupported import in " + path + ": " + spec);
        const resolved = resolvePreviewImport(path, spec, files);
        if (resolved.endsWith(".css")) throw new Error("Imported CSS must use a side-effect import.");
        return before + resolved + after;
      });
}

export async function compileReactPreview(
  files: FullAppFiles,
  nonce: string,
): Promise<ReactPreviewResult> {
  const prepared = preparePreviewSources(files);
  const ts = await import("typescript");
  const importMap: Record<string, string> = { ...CDN_MODULES };
  const warnings = [...prepared.warnings];
  for (const [path, source] of Object.entries(prepared.files)) {
    let js: string;
    if (path.endsWith(".json")) {
      try { js = "export default " + JSON.stringify(JSON.parse(source)) + ";\n"; }
      catch { throw new Error("Invalid JSON: " + path); }
    } else {
      // The generated scaffold contains Vite's public import.meta.env fields.
      // Do not expose Obsidian's own environment or user authentication.
      const input = source.replace(/\bimport\.meta\.env\b/g, "globalThis.__OBSIDIAN_PREVIEW_ENV");
      const transformed = ts.transpileModule(input, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX, isolatedModules: true,
        },
      });
      const errors = transformed.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) ?? [];
      if (errors.length) {
        const msg = ts.flattenDiagnosticMessageText(errors[0].messageText, " ");
        throw new Error(path + ": " + msg);
      }
      js = transformed.outputText;
      if (JSX_SRC.test(path) && !source.includes("export")) warnings.push(path + ": no exports detected.");
    }
    const rewritten = rewriteModuleImports(path, js, files);
    importMap[PREFIX + path] = toDataUrl(rewritten);
  }

  const safeNonce = nonce.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const runtime = [
    "const nonce = " + JSON.stringify(safeNonce) + ";",
    "const send = (kind, message) => { try { parent.postMessage({ ns: 'obsidian.fullapp.preview.v1', nonce, kind, message: String(message || '').slice(0, 350) }, '*'); } catch {} };",
    "window.__OBSIDIAN_PREVIEW_ENV = { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' };",
    "window.addEventListener('error', e => send('error', e.message || 'Runtime error'));",
    "window.addEventListener('unhandledrejection', e => send('error', e.reason?.message || String(e.reason)));",
    "try { await import('@obsidian-preview/src/main.tsx'); send('ready', 'React preview rendered.'); }",
    "catch (err) { send('error', err?.message || String(err)); const p = document.createElement('pre'); p.textContent = 'Preview failed: ' + (err?.message || String(err)); p.style.cssText = 'color:#fca5a5;white-space:pre-wrap;padding:16px'; document.body.append(p); }",
  ].join("\n");

  // Strict sandbox, no same-origin permission. Dependency requests go to a
  // pinned public CDN. Application source is encoded in iframe import-map
  // data URLs, not uploaded to a remote compilation service.
  const policy = "default-src 'none'; script-src 'unsafe-inline' data: https://esm.sh https://*.esm.sh; " +
    "style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; " +
    "connect-src https:; base-uri 'none'; form-action 'none'; frame-src 'none'";
  return {
    html: [
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
      "<meta http-equiv=\"Content-Security-Policy\" content=\"" + policy + "\">",
      "<style>" + prepared.css.replace(/<\/style/gi, "<\\/style") + "</style>",
      "<script type=\"importmap\">" + jsonScript({ imports: importMap }) + "</script>",
      "</head><body><div id=\"root\"></div>",
      "<script type=\"module\">" + runtime.replace(/<\/script/gi, "<\\/script") + "</script>",
      "</body></html>",
    ].join(""),
    fileCount: Object.keys(prepared.files).length,
    warnings,
  };
}
