// Lexical masker for JavaScript source strings. Returns a same-length
// string where string bodies, template bodies, single-line comments, and
// block comments have every character (except delimiters and quotes)
// replaced with a filler character 'x'. Callers can regex-match against
// the mask without matching text that lives inside a string or comment.
//
// Character positions in the returned string align 1:1 with the input, so
// callers can translate a match index back into the raw source unchanged.
//
// This is intentionally small — it does not tokenize JS, it doesn't try
// to parse regex literals as regex (they end up looking like division
// operators, which is safe for our purposes since we never inspect them).
// It is used by navigation-repair and preview-policy to avoid matching
// nav-looking tokens that only appear inside strings or comments.

export function jsLexicalMask(src: string): string {
  const n = src.length;
  const out = new Array<string>(n);
  let i = 0;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    // Line comment
    if (c === "/" && c2 === "/") {
      out[i] = "/"; out[i + 1] = "/"; i += 2;
      while (i < n && src[i] !== "\n") { out[i] = "x"; i++; }
      continue;
    }
    // Block comment
    if (c === "/" && c2 === "*") {
      out[i] = "/"; out[i + 1] = "*"; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out[i] = "x"; i++; }
      if (i < n) { out[i] = "*"; out[i + 1] = "/"; i += 2; }
      continue;
    }
    // String or template
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out[i] = c; i++;
      while (i < n) {
        const ch = src[i];
        if (ch === "\\" && i + 1 < n) { out[i] = "x"; out[i + 1] = "x"; i += 2; continue; }
        if (ch === quote) { out[i] = ch; i++; break; }
        // Preserve template placeholder markers so the scanner still
        // knows a `${...}` chunk contains real code — mask its inside
        // recursively.
        if (quote === "`" && ch === "$" && src[i + 1] === "{") {
          out[i] = "$"; out[i + 1] = "{"; i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const inner = src[i];
            if (inner === "{") depth++;
            else if (inner === "}") { depth--; if (depth === 0) break; }
            // Recurse the mask over the placeholder body.
            const sub = jsLexicalMask(src.slice(i, i + 1));
            out[i] = sub[0] ?? inner;
            i++;
          }
          if (i < n) { out[i] = "}"; i++; }
          continue;
        }
        out[i] = "x"; i++;
      }
      continue;
    }
    out[i] = c; i++;
  }
  return out.join("");
}

/** True if a masked-source index falls inside code (i.e., not a masked
 *  segment). Cheap sanity check for callers that only have an index. */
export function isCodePosition(mask: string, raw: string, idx: number): boolean {
  return mask[idx] === raw[idx];
}
