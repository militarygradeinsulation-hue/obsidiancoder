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

export function applyPatch(baseHtml: string, patch: Patch): ApplyResult {
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

  return { ok: true, html, applied, charsAdded: totalAdded, charsRemoved: totalRemoved };
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
