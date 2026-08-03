// Theme director — deterministic archetype variety for fresh builds.
//
// Problem this solves: the STYLE_LIBRARY tells the model to pick an
// archetype by subject, and models are strongly biased toward the same
// pick for similar prompts (SaaS-ish prompt -> A1/A3 every time). Result:
// every build looks the same. This module makes the pick *for* the model,
// deterministically, from a subject-appropriate pool, while rotating away
// from recently used archetypes so consecutive builds visibly differ.
//
// Zero dependencies, zero imports. Pure function (pickArchetype) for
// testability plus a stateful wrapper (archetypeDirective) that keeps a
// small in-process memory of recent picks.

export interface ArchetypePick {
  id: string;
  name: string;
  directive: string;
}

const ARCHETYPE_NAMES: Record<string, string> = {
  A1: 'Dark Tech / 3D Abstract',
  A2: 'Web3 Neon / Deep Purple',
  A3: 'Clean SaaS Light',
  A4: 'Editorial Fashion / Lookbook',
  A5: 'Luxury Minimal Serif',
  A6: 'Playful Bold / EdTech',
  A7: 'Gradient Glass / AI-ML',
  A8: 'Brutalist Signal Red',
};

/** Subject pools: every pool has >=3 members so rotation has room. */
const POOLS: Array<{ match: RegExp; pool: string[] }> = [
  { match: /\b(crypto|nft|token|web3|blockchain|gaming|game)\b/i, pool: ['A2', 'A1', 'A7'] },
  { match: /\b(accounting|hr|payroll|finance|analytics|dashboard|ops|b2b|crm|invoic)/i, pool: ['A3', 'A7', 'A5'] },
  { match: /\b(fashion|portfolio|photograph|creator|lookbook|apparel|model)\b/i, pool: ['A4', 'A5', 'A6'] },
  { match: /\b(real ?estate|architect|hospitality|hotel|luxury|villa|interior)\b/i, pool: ['A5', 'A4', 'A3'] },
  { match: /\b(edtech|education|school|kids|community|course|learn)\b/i, pool: ['A6', 'A8', 'A4'] },
  { match: /\b(agency|studio|launch|campaign|bold)\b/i, pool: ['A8', 'A1', 'A6'] },
  { match: /\b(ai|ml|dev|api|sdk|infra|platform|data|saas|tool)\b/i, pool: ['A1', 'A7', 'A8', 'A2'] },
];

const ALL = Object.keys(ARCHETYPE_NAMES);

/** FNV-1a 32-bit — stable, dependency-free string hash. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function poolFor(prompt: string): string[] {
  for (const { match, pool } of POOLS) if (match.test(prompt)) return pool;
  return ALL;
}

/**
 * Pure pick: subject-appropriate pool, minus recently used archetypes
 * (unless that would empty the pool), indexed by prompt hash.
 */
export function pickArchetype(prompt: string, recent: string[] = []): ArchetypePick {
  const pool = poolFor(prompt);
  const fresh = pool.filter((id) => !recent.includes(id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const id = candidates[fnv1a(prompt) % candidates.length];
  const name = ARCHETYPE_NAMES[id];
  const directive = [
    `ARCHETYPE DIRECTIVE — non-negotiable: use archetype ${id} (${name}) from the AETHERIS STYLE LIBRARY for this build.`,
    'Do not choose a different archetype, regardless of the subject-based selection logic.',
    'Apply its full token/type/layout/motion spec exactly as written: exact hex values, exact fonts, exact radii, exact shadows — no substitutes, no defaulting to dark backgrounds or purple gradients unless the archetype specifies them.',
    'State the assigned archetype in the head comment as usual.',
  ].join(' ');
  return { id, name, directive };
}

// ---- stateful wrapper: rotate away from the last few picks -----------------

const RECENT_LIMIT = 3;
const recentPicks: string[] = [];

/** Pick with in-process anti-repeat memory. Used by the generate route. */
export function archetypeDirective(prompt: string): ArchetypePick {
  const pick = pickArchetype(prompt ?? '', recentPicks);
  recentPicks.push(pick.id);
  while (recentPicks.length > RECENT_LIMIT) recentPicks.shift();
  return pick;
}

/** Test/inspection hook. */
export function recentArchetypes(): string[] {
  return [...recentPicks];
}
