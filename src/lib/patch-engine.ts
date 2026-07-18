// Patch application engine — applies a validated Patch sequentially to a
// cloned working string. All-or-nothing: any failure aborts and the caller
// keeps the last stable HTML. Never mutates input.

import type { Patch, PatchOp } from "./patch-protocol";
import { MAX_OP_SIZE } from "./patch-protocol";

export type AppliedOp = {
  op: PatchOp["op"];
  summary: string;
  charsAdded: number;
  charsRemoved: number;
};

export type ApplyResult =
  | {
      ok: true;
      html: string;
      applied: AppliedOp[];
      charsAdded: number;
      charsRemoved: number;
    }
  | {
      ok: false;
      error: string;
      failedAt: number; // 1-based op index
      op: PatchOp["op"] | null;
    };

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = hay.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/** Match a full element by id: <tag ... id="ID" ...>...</tag>. Self-closing not supported (patch targets containers). */
function findElementById(html: string, id: string): { start: number; end: number; openEnd: number; tag: string } | null {
  // Find opening tag containing id="ID" or id='ID'
  const attrRe = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bid\\s*=\\s*(["'])${escapeRegex(id)}\\2[^>]*>`);
  const m = attrRe.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const openStart = m.index;
  const openEnd = openStart + m[0].length;
  // Walk to matching closing tag, honoring nesting.
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  openRe.lastIndex = openEnd;
  closeRe.lastIndex = openEnd;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return { start: openStart, end: nextClose.index + nextClose[0].length, openEnd, tag };
      }
      openRe.lastIndex = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Set (or add) an attribute on an existing opening tag. */
function setAttribute(openTag: string, attribute: string, value: string): string {
  const attrRe = new RegExp(`\\s${escapeRegex(attribute)}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const escaped = value.replace(/"/g, "&quot;");
  if (attrRe.test(openTag)) {
    return openTag.replace(attrRe, ` ${attribute}="${escaped}"`);
  }
  // insert before the closing '>' (or '/>')
  return openTag.replace(/\/?>$/, (m) => ` ${attribute}="${escaped}"${m}`);
}

/** Append CSS to the last <style> block, or create one in <head>/<body>. */
function appendCss(html: string, rule: string): { html: string; added: number } {
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) last = m;
  const injection = `\n${rule.trim()}\n`;
  if (last) {
    const inner = last[1];
    const before = html.slice(0, last.index);
    const openTag = last[0].slice(0, last[0].indexOf(">") + 1);
    const after = html.slice(last.index + last[0].length);
    return { html: `${before}${openTag}${inner}${injection}</style>${after}`, added: injection.length };
  }
  const block = `<style>${injection}</style>`;
  if (/<\/head>/i.test(html)) {
    return { html: html.replace(/<\/head>/i, `${block}\n</head>`), added: block.length };
  }
  if (/<body\b[^>]*>/i.test(html)) {
    return { html: html.replace(/<body\b[^>]*>/i, (m) => `${m}\n${block}`), added: block.length };
  }
  return { html: html + `\n${block}`, added: block.length + 1 };
}

/** Append a <script> block just before </body> (or at end). */
function appendScript(html: string, code: string): { html: string; added: number } {
  const block = `<script>\n${code.trim()}\n</script>`;
  if (/<\/body>/i.test(html)) {
    return { html: html.replace(/<\/body>/i, `${block}\n</body>`), added: block.length };
  }
  return { html: html + `\n${block}`, added: block.length + 1 };
}

export type ApplyOptions = { dryRun?: boolean };

export function applyPatch(baseHtml: string, patch: Patch, options: ApplyOptions = {}): ApplyResult {
  let html = baseHtml;
  const applied: AppliedOp[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  for (let i = 0; i < patch.operations.length; i++) {
    const op = patch.operations[i];
    const before = html;
    try {
      switch (op.op) {
        case "replace_text": {
          const count = countOccurrences(html, op.find);
          if (count === 0) return { ok: false, failedAt: i + 1, op: op.op, error: `replace_text anchor not found: "${op.find.slice(0, 60)}"` };
          if (count > 1 && !op.allow_multiple) return { ok: false, failedAt: i + 1, op: op.op, error: `replace_text anchor is ambiguous (${count} matches); set allow_multiple or narrow it.` };
          html = op.allow_multiple
            ? html.split(op.find).join(op.replace)
            : html.replace(op.find, op.replace);
          const removed = op.find.length * count;
          const added = op.replace.length * count;
          applied.push({ op: op.op, summary: `Replaced ${count}× "${trunc(op.find)}" → "${trunc(op.replace)}"`, charsAdded: added, charsRemoved: removed });
          break;
        }
        case "delete_text": {
          const count = countOccurrences(html, op.find);
          if (count === 0) return { ok: false, failedAt: i + 1, op: op.op, error: `delete_text anchor not found: "${op.find.slice(0, 60)}"` };
          if (count > 1 && !op.allow_multiple) return { ok: false, failedAt: i + 1, op: op.op, error: `delete_text anchor is ambiguous (${count} matches).` };
          html = op.allow_multiple ? html.split(op.find).join("") : html.replace(op.find, "");
          const removed = op.find.length * count;
          applied.push({ op: op.op, summary: `Deleted ${count}× "${trunc(op.find)}"`, charsAdded: 0, charsRemoved: removed });
          break;
        }
        case "insert_before":
        case "insert_after": {
          const count = countOccurrences(html, op.anchor);
          if (count === 0) return { ok: false, failedAt: i + 1, op: op.op, error: `${op.op} anchor not found: "${op.anchor.slice(0, 60)}"` };
          if (count > 1) return { ok: false, failedAt: i + 1, op: op.op, error: `${op.op} anchor is ambiguous (${count} matches).` };
          const idx = html.indexOf(op.anchor);
          if (op.op === "insert_before") {
            html = html.slice(0, idx) + op.content + html.slice(idx);
          } else {
            const at = idx + op.anchor.length;
            html = html.slice(0, at) + op.content + html.slice(at);
          }
          applied.push({ op: op.op, summary: `${op.op === "insert_before" ? "Inserted before" : "Inserted after"} "${trunc(op.anchor)}"`, charsAdded: op.content.length, charsRemoved: 0 });
          break;
        }
        case "replace_element_by_id": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found (or unmatched tag).` };
          const oldInner = html.slice(found.openEnd, closeStartOf(html, found));
          html = html.slice(0, found.openEnd) + op.content + html.slice(closeStartOf(html, found));
          applied.push({ op: op.op, summary: `Replaced contents of #${op.id}`, charsAdded: op.content.length, charsRemoved: oldInner.length });
          break;
        }
        case "set_attribute": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found.` };
          const openTag = html.slice(found.start, found.openEnd);
          const newOpen = setAttribute(openTag, op.attribute, op.value);
          html = html.slice(0, found.start) + newOpen + html.slice(found.openEnd);
          applied.push({ op: op.op, summary: `Set ${op.attribute}="${trunc(op.value, 30)}" on #${op.id}`, charsAdded: Math.max(0, newOpen.length - openTag.length), charsRemoved: Math.max(0, openTag.length - newOpen.length) });
          break;
        }
        case "append_css_rule": {
          const r = appendCss(html, op.rule);
          html = r.html;
          applied.push({ op: op.op, summary: `Appended CSS rule (${op.rule.length}c)`, charsAdded: r.added, charsRemoved: 0 });
          break;
        }
        case "append_script": {
          const r = appendScript(html, op.code);
          html = r.html;
          applied.push({ op: op.op, summary: `Appended script block (${op.code.length}c)`, charsAdded: r.added, charsRemoved: 0 });
          break;
        }
        case "remove_element_by_id": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found.` };
          const removed = html.slice(found.start, found.end);
          if (op.expected_prev && !removed.includes(op.expected_prev)) {
            return { ok: false, failedAt: i + 1, op: op.op, error: `expected_prev mismatch on #${op.id}` };
          }
          html = html.slice(0, found.start) + html.slice(found.end);
          applied.push({ op: op.op, summary: `Removed #${op.id}`, charsAdded: 0, charsRemoved: removed.length });
          break;
        }
        case "remove_attribute": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found.` };
          const openTag = html.slice(found.start, found.openEnd);
          const attrRe = new RegExp(`\\s${escapeRegex(op.attribute)}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
          if (!attrRe.test(openTag)) return { ok: false, failedAt: i + 1, op: op.op, error: `attribute ${op.attribute} not present on #${op.id}` };
          const newOpen = openTag.replace(attrRe, "");
          html = html.slice(0, found.start) + newOpen + html.slice(found.openEnd);
          applied.push({ op: op.op, summary: `Removed @${op.attribute} from #${op.id}`, charsAdded: 0, charsRemoved: openTag.length - newOpen.length });
          break;
        }
        case "add_class":
        case "remove_class": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found.` };
          const openTag = html.slice(found.start, found.openEnd);
          const classRe = /\sclass\s*=\s*("([^"]*)"|'([^']*)')/i;
          const m = classRe.exec(openTag);
          const current = m ? (m[2] ?? m[3] ?? "") : "";
          const set = new Set(current.split(/\s+/).filter(Boolean));
          if (op.op === "add_class") set.add(op.class_name);
          else {
            if (!set.has(op.class_name)) return { ok: false, failedAt: i + 1, op: op.op, error: `class ${op.class_name} not present on #${op.id}` };
            set.delete(op.class_name);
          }
          const nextClasses = Array.from(set).join(" ");
          const newOpen = m
            ? openTag.replace(classRe, nextClasses ? ` class="${nextClasses}"` : "")
            : setAttribute(openTag, "class", nextClasses);
          html = html.slice(0, found.start) + newOpen + html.slice(found.openEnd);
          applied.push({ op: op.op, summary: `${op.op === "add_class" ? "Added" : "Removed"} class .${op.class_name} on #${op.id}`, charsAdded: Math.max(0, newOpen.length - openTag.length), charsRemoved: Math.max(0, openTag.length - newOpen.length) });
          break;
        }
        case "insert_child": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found.` };
          const closeAt = closeStartOf(html, found);
          const insertAt = op.position === "first" ? found.openEnd : closeAt;
          html = html.slice(0, insertAt) + op.content + html.slice(insertAt);
          applied.push({ op: op.op, summary: `Inserted ${op.position}-child in #${op.id}`, charsAdded: op.content.length, charsRemoved: 0 });
          break;
        }
        case "update_inline_style": {
          const found = findElementById(html, op.id);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.id} not found.` };
          const openTag = html.slice(found.start, found.openEnd);
          const styleRe = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i;
          const m = styleRe.exec(openTag);
          const current = m ? (m[2] ?? m[3] ?? "") : "";
          const pairs = current.split(";").map((s) => s.trim()).filter(Boolean);
          const next: string[] = [];
          let replaced = false;
          for (const p of pairs) {
            const [k, ...rest] = p.split(":");
            if (k && k.trim().toLowerCase() === op.property.toLowerCase()) {
              if (op.value !== "") { next.push(`${op.property}: ${op.value}`); }
              replaced = true;
            } else {
              next.push(`${k}:${rest.join(":")}`);
            }
          }
          if (!replaced && op.value !== "") next.push(`${op.property}: ${op.value}`);
          const nextStyle = next.join("; ");
          const newOpen = m
            ? openTag.replace(styleRe, nextStyle ? ` style="${nextStyle}"` : "")
            : nextStyle ? setAttribute(openTag, "style", nextStyle) : openTag;
          html = html.slice(0, found.start) + newOpen + html.slice(found.openEnd);
          applied.push({ op: op.op, summary: `Set style ${op.property} on #${op.id}`, charsAdded: Math.max(0, newOpen.length - openTag.length), charsRemoved: Math.max(0, openTag.length - newOpen.length) });
          break;
        }
        case "replace_css_rule": {
          const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
          const selector = op.selector.trim();
          const escSel = escapeRegex(selector);
          const ruleRe = new RegExp(`${escSel}\\s*\\{[\\s\\S]*?\\}`, "g");
          let replacedCount = 0;
          html = html.replace(styleRe, (block, inner: string) => {
            const updated = (inner as string).replace(ruleRe, () => {
              replacedCount++;
              return `${selector} { ${op.body.trim()} }`;
            });
            return block.replace(inner, updated);
          });
          if (replacedCount === 0) {
            const r = appendCss(html, `${selector} { ${op.body.trim()} }`);
            html = r.html;
            applied.push({ op: op.op, summary: `Appended new CSS rule for ${selector}`, charsAdded: r.added, charsRemoved: 0 });
          } else {
            applied.push({ op: op.op, summary: `Replaced CSS rule(s) for ${selector} (${replacedCount})`, charsAdded: op.body.length, charsRemoved: 0 });
          }
          break;
        }
        case "replace_script_block": {
          const marker = op.marker;
          const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
          let hit = false;
          html = html.replace(scriptRe, (full, inner: string) => {
            if (hit || !(inner as string).includes(marker)) return full;
            hit = true;
            return full.replace(inner as string, `\n${op.code}\n`);
          });
          if (!hit) return { ok: false, failedAt: i + 1, op: op.op, error: `no <script> block contains marker "${trunc(marker)}"` };
          applied.push({ op: op.op, summary: `Replaced script block by marker (${trunc(marker)})`, charsAdded: op.code.length, charsRemoved: 0 });
          break;
        }
        case "rename_id": {
          const found = findElementById(html, op.from);
          if (!found) return { ok: false, failedAt: i + 1, op: op.op, error: `element #${op.from} not found.` };
          if (findElementById(html, op.to)) return { ok: false, failedAt: i + 1, op: op.op, error: `target id #${op.to} already exists.` };
          const openTag = html.slice(found.start, found.openEnd);
          const idRe = new RegExp(`(\\bid\\s*=\\s*["'])${escapeRegex(op.from)}(["'])`);
          const newOpen = openTag.replace(idRe, `$1${op.to}$2`);
          html = html.slice(0, found.start) + newOpen + html.slice(found.openEnd);
          let refUpdates = 0;
          if (op.update_references !== false) {
            const hashRe = new RegExp(`(["'#])${escapeRegex(op.from)}(?=["'\\s#.\\[])`, "g");
            html = html.replace(hashRe, (_m, p1: string) => { refUpdates++; return `${p1}${op.to}`; });
          }
          applied.push({ op: op.op, summary: `Renamed #${op.from} → #${op.to} (${refUpdates} refs)`, charsAdded: op.to.length, charsRemoved: op.from.length });
          break;
        }
        case "update_json_block": {
          try { JSON.parse(op.json); } catch (e) {
            return { ok: false, failedAt: i + 1, op: op.op, error: `invalid JSON body: ${(e as Error).message}` };
          }
          const marker = op.marker;
          const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
          let hit = false;
          html = html.replace(scriptRe, (full, attrs: string, inner: string) => {
            if (hit) return full;
            const hasJsonType = /type\s*=\s*["']application\/json["']/i.test(attrs as string);
            if (!hasJsonType || !(inner as string).includes(marker)) return full;
            hit = true;
            return full.replace(inner as string, `\n${op.json}\n`);
          });
          if (!hit) return { ok: false, failedAt: i + 1, op: op.op, error: `no <script type="application/json"> contains marker "${trunc(marker)}"` };
          applied.push({ op: op.op, summary: `Updated JSON block (${trunc(marker)})`, charsAdded: op.json.length, charsRemoved: 0 });
          break;
        }
        default: {
          return { ok: false, failedAt: i + 1, op: null, error: "Unknown op type." };
        }
      }
    } catch (e) {
      return { ok: false, failedAt: i + 1, op: op.op, error: `Apply threw: ${(e as Error).message}` };
    }

    const delta = html.length - before.length;
    if (delta > 0) totalAdded += delta;
    else totalRemoved += -delta;
    if (html.length > baseHtml.length + MAX_OP_SIZE * patch.operations.length) {
      return { ok: false, failedAt: i + 1, op: op.op, error: "Patch exceeded size ceiling." };
    }
  }

  // Recompute exact totals from op summaries so caller sees per-op adds/removes.
  totalAdded = applied.reduce((s, a) => s + a.charsAdded, 0);
  totalRemoved = applied.reduce((s, a) => s + a.charsRemoved, 0);

  return {
    ok: true,
    html: options.dryRun ? baseHtml : html,
    applied,
    charsAdded: totalAdded,
    charsRemoved: totalRemoved,
  };
}

/** Preflight — apply as a dry-run to verify all ops resolve before mutating. */
export function preflightPatch(baseHtml: string, patch: Patch): ApplyResult {
  return applyPatch(baseHtml, patch, { dryRun: true });
}

function closeStartOf(html: string, found: { start: number; end: number; openEnd: number; tag: string }): number {
  // The close tag ends at found.end; its start is end - len('</tag>')
  const closeTag = `</${found.tag}`;
  const idx = html.lastIndexOf(closeTag, found.end);
  return idx === -1 ? found.end : idx;
}

function trunc(s: string, n = 60) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}
