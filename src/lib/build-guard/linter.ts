import type { BuildManifest, BuildPage, Violation, ViolationClass } from './types';

const A_RX = /<a\b[^>]*>/gi;
const BUTTON_RX = /<button\b[^>]*>/gi;
const FORM_RX = /<form\b[^>]*>/gi;
const ID_RX = /\bid\s*=\s*["']([^"']+)["']/g;

/** Extract an attribute value from a serialized open tag, or null if absent. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!m) return null;
  return m[2] ?? m[3] ?? '';
}

/** "/jobs/:id" matches "/jobs/42"; exact segments must match exactly. */
export function routeMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  const p = pattern.split('/').filter(Boolean);
  const t = path.split('/').filter(Boolean);
  if (p.length !== t.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === t[i]);
}

function matchesManifest(manifest: BuildManifest, rawPath: string): boolean {
  const path = rawPath.split(/[?#]/)[0] || '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return manifest.routes.some((r) => routeMatches(r, normalized));
}

/**
 * Lint a set of generated pages against the manifest.
 * Deterministic, dependency-free, regex-based; elements already
 * hard-gated (data-guard-gated) are skipped.
 */
export function lintBuild(pages: BuildPage[], manifest: BuildManifest): Violation[] {
  const out: Violation[] = [];
  const contacts = new Set((manifest.contacts ?? []).map((c) => c.toLowerCase()));

  for (const page of pages) {
    const ids = new Set<string>();
    for (const m of page.html.matchAll(ID_RX)) ids.add(m[1]);
    const hasForm = FORM_RX.test(page.html);
    FORM_RX.lastIndex = 0;

    const push = (cls: ViolationClass, element: string, target: string, fixHint: string) =>
      out.push({ cls, route: page.route, element, target, fixHint });

    // Anchors
    for (const m of page.html.matchAll(A_RX)) {
      const tag = m[0];
      if (/data-guard-gated/i.test(tag)) continue;
      const href = attr(tag, 'href');
      if (href === null) {
        push('missing-handler', tag, '(none)', 'give this link an href to a listed route or remove it');
        continue;
      }
      const h = href.trim();
      if (h === '' || h === '#') {
        push('empty-href', tag, h, 'point this link at a real listed route');
      } else if (/^javascript:/i.test(h)) {
        push('js-void', tag, h, 'replace the javascript: URL with a listed route');
      } else if (h.startsWith('#')) {
        if (!ids.has(h.slice(1))) {
          push('broken-anchor', tag, h, `no element with id "${h.slice(1)}" exists on this page; fix the id or the fragment`);
        }
      } else if (/^(mailto:|tel:)/i.test(h)) {
        if (!contacts.has(h.toLowerCase())) {
          push('unlisted-contact', tag, h, 'this contact URI is not declared in the manifest; use a declared one or remove it');
        }
      } else if (/^(https?:)?\/\//i.test(h) || /^[a-z][a-z0-9+.-]*:/i.test(h)) {
        push('external-link', tag, h, 'links must stay inside the build; point at a listed route');
      } else if (!matchesManifest(manifest, h)) {
        push('dead-route', tag, h, `route "${h}" is not in the manifest; use one of: ${manifest.routes.join(', ')}`);
      }
    }

    // Buttons
    for (const m of page.html.matchAll(BUTTON_RX)) {
      const tag = m[0];
      if (/data-guard-gated/i.test(tag)) continue;
      const dataHref = attr(tag, 'data-href');
      if (dataHref !== null) {
        const h = dataHref.trim();
        if (/^(https?:)?\/\//i.test(h) || /^[a-z][a-z0-9+.-]*:/i.test(h)) {
          push('external-link', tag, h, 'buttons must stay inside the build; point data-href at a listed route');
        } else if (!matchesManifest(manifest, h)) {
          push('dead-route', tag, h, `route "${h}" is not in the manifest; use one of: ${manifest.routes.join(', ')}`);
        }
        continue;
      }
      const submits = /\btype\s*=\s*["']submit["']/i.test(tag) && hasForm;
      const handled = attr(tag, 'onclick') !== null;
      if (!submits && !handled) {
        push('missing-handler', tag, '(none)', 'wire this button to a handler, a form submit, or a data-href to a listed route');
      }
    }

    // Forms
    for (const m of page.html.matchAll(FORM_RX)) {
      const tag = m[0];
      if (/data-guard-gated/i.test(tag)) continue;
      const action = attr(tag, 'action');
      if (action === null || action.trim() === '') continue; // JS-handled form is fine
      const a = action.trim();
      if (/^(https?:)?\/\//i.test(a) || /^[a-z][a-z0-9+.-]*:/i.test(a)) {
        push('external-form', tag, a, 'forms must post inside the build; use a listed route or handle submit in JS');
      } else if (!matchesManifest(manifest, a)) {
        push('dead-route', tag, a, `form action "${a}" is not in the manifest; use one of: ${manifest.routes.join(', ')}`);
      }
    }
  }
  return out;
}

/**
 * Fraction of interactive elements (anchors, buttons, forms) with no
 * violation. 1 means clean; a build with no interactive elements is 1.
 */
export function passRate(pages: BuildPage[], manifest: BuildManifest): number {
  let total = 0;
  for (const p of pages) {
    total += [...p.html.matchAll(A_RX)].length;
    total += [...p.html.matchAll(BUTTON_RX)].length;
    total += [...p.html.matchAll(FORM_RX)].length;
  }
  if (total === 0) return 1;
  const bad = new Set(lintBuild(pages, manifest).map((v) => `${v.route}::${v.element}`)).size;
  return (total - Math.min(bad, total)) / total;
}
