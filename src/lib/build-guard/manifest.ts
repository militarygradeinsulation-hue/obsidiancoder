import type { BuildManifest } from './types';

/** Static or param segments only: "/", "/about", "/jobs/:id". */
const ROUTE_RX =
  /^\/$|^\/(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9_]*)(?:\/(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9_]*))*$/;

/**
 * Validate a manifest. Returns a list of human-readable problems;
 * an empty array means the manifest is usable.
 */
export function validateManifest(m: BuildManifest): string[] {
  const errs: string[] = [];
  if (!m.routes || m.routes.length === 0) errs.push('manifest has no routes');
  const seen = new Set<string>();
  for (const r of m.routes ?? []) {
    if (!ROUTE_RX.test(r)) errs.push(`invalid route: ${r}`);
    if (seen.has(r)) errs.push(`duplicate route: ${r}`);
    seen.add(r);
  }
  for (const c of m.contacts ?? []) {
    if (!/^(mailto:|tel:)/i.test(c)) errs.push(`invalid contact: ${c}`);
  }
  return errs;
}

/** Default manifest for single-page builds. */
export function singlePageManifest(): BuildManifest {
  return { routes: ['/'] };
}

/**
 * The navigation contract, phrased for the generator prompt. Concrete
 * destinations, not adjectives, so the model has nothing to improvise.
 */
export function manifestPromptFragment(m: BuildManifest): string {
  const contacts = m.contacts?.length
    ? `Contact links allowed, exactly these: ${m.contacts.join(', ')}.`
    : 'Do not use mailto: or tel: links.';
  return [
    'NAVIGATION CONTRACT - follow exactly.',
    `Every link and button must resolve to one of these routes: ${m.routes.join(', ')}.`,
    'Never link to external domains.',
    'Never use href="#", an empty href, or javascript: URLs.',
    'Every button must have a working handler or navigate to a listed route.',
    contacts,
  ].join(' ');
}
