/**
 * build-guard: shared types.
 *
 * The guard's job: no generated build ever ships a dead button or a link
 * that leaves the build. Everything routes to a destination declared in
 * the BuildManifest, or it gets repaired, or it gets hard-gated.
 */

/** The eight violation classes the linter detects. */
export type ViolationClass =
  | 'external-link' // href points off-site or uses a non-web scheme
  | 'dead-route' // internal destination not present in the manifest
  | 'empty-href' // href="" or href="#"
  | 'js-void' // javascript: pseudo-links
  | 'unlisted-contact' // mailto:/tel: not declared in manifest.contacts
  | 'missing-handler' // link or button with no destination and no handler
  | 'broken-anchor' // #fragment with no matching id on the page
  | 'external-form'; // form action posting outside the build

/** Allowed destinations for a generated build. */
export interface BuildManifest {
  /** Internal routes, e.g. "/", "/about", "/jobs/:id". Param segments use ":name". */
  routes: string[];
  /** Optional contact URIs the build may use, e.g. "mailto:hi@obsidian.app". */
  contacts?: string[];
}

/** One generated page. */
export interface BuildPage {
  /** The route this page is served at. */
  route: string;
  /** Full generated HTML for the page. */
  html: string;
}

/** One offending interactive element. */
export interface Violation {
  cls: ViolationClass;
  /** Route of the page the offender lives on. */
  route: string;
  /** The exact serialized open tag of the offending element. */
  element: string;
  /** The destination (or lack of one) that failed. */
  target: string;
  /** One-line instruction for the repair model. */
  fixHint: string;
}
