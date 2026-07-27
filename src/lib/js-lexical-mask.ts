// Lexical masker for JavaScript source. Returns a same-length string in
// which characters that live inside string bodies, template literal text,
// single-line comments, block comments, and regex literals are replaced
// with the filler character 'x'. Delimiters (quotes, backticks, comment
// markers, regex slashes) are preserved so callers can still recognise
// segment boundaries. Executable code inside `${...}` template
// expressions remains visible — including nested strings, comments,
// templates, and further `${...}` inside them — so the scanner can still
// see real navigation calls constructed via template interpolation.
//
// Positions in the returned string align 1:1 with the input.
//
// Regex literals are detected conservatively: only after an operator/
// punctuator context where a regex is grammatically valid. That keeps
// tokens like `/location.href/` in a real regex from being interpreted as
// executable navigation, without confusing division in ordinary code.

const REGEX_PRECEDING = /[=(,;:!&|?{}+\-*%~^<>\[\]]$|^$|\b(?:return|typeof|instanceof|in|of|delete|void|throw|new|case|do|else|await|yield)$/;

interface MaskState {
  src: string;
  out: string[];
  i: number;
}

function newState(src: string): MaskState {
  return { src, out: new Array<string>(src.length), i: 0 };
}

function maskLineComment(s: MaskState): void {
  const { src } = s;
  s.out[s.i] = "/"; s.out[s.i + 1] = "/"; s.i += 2;
  while (s.i < src.length && src[s.i] !== "\n") { s.out[s.i] = "x"; s.i++; }
}

function maskBlockComment(s: MaskState): void {
  const { src } = s;
  s.out[s.i] = "/"; s.out[s.i + 1] = "*"; s.i += 2;
  while (s.i < src.length && !(src[s.i] === "*" && src[s.i + 1] === "/")) {
    s.out[s.i] = src[s.i] === "\n" ? "\n" : "x";
    s.i++;
  }
  if (s.i < src.length) { s.out[s.i] = "*"; s.out[s.i + 1] = "/"; s.i += 2; }
}

function maskString(s: MaskState, quote: string): void {
  const { src } = s;
  s.out[s.i] = quote; s.i++;
  while (s.i < src.length) {
    const ch = src[s.i];
    if (ch === "\\" && s.i + 1 < src.length) {
      s.out[s.i] = "x";
      s.out[s.i + 1] = src[s.i + 1] === "\n" ? "\n" : "x";
      s.i += 2; continue;
    }
    if (ch === quote) { s.out[s.i] = ch; s.i++; return; }
    if (ch === "\n" && quote !== "`") { s.out[s.i] = "\n"; s.i++; return; }
    s.out[s.i] = ch === "\n" ? "\n" : "x";
    s.i++;
  }
}

function maskTemplate(s: MaskState): void {
  const { src } = s;
  s.out[s.i] = "`"; s.i++;
  while (s.i < src.length) {
    const ch = src[s.i];
    if (ch === "\\" && s.i + 1 < src.length) {
      s.out[s.i] = "x";
      s.out[s.i + 1] = src[s.i + 1] === "\n" ? "\n" : "x";
      s.i += 2; continue;
    }
    if (ch === "`") { s.out[s.i] = "`"; s.i++; return; }
    if (ch === "$" && src[s.i + 1] === "{") {
      s.out[s.i] = "$"; s.out[s.i + 1] = "{"; s.i += 2;
      maskExpression(s); // recursive — handles nested strings/templates/braces
      if (s.i < src.length && src[s.i] === "}") { s.out[s.i] = "}"; s.i++; }
      continue;
    }
    s.out[s.i] = ch === "\n" ? "\n" : "x";
    s.i++;
  }
}

/** Mask a `${...}` expression body. Leaves real code visible; recurses on
 *  nested strings/comments/regex/templates. Stops at the matching '}' of
 *  the enclosing template placeholder (depth 0 at entry). */
function maskExpression(s: MaskState): void {
  const { src } = s;
  let depth = 0;
  let prevMeaningful = ""; // last non-whitespace character in output stream
  while (s.i < src.length) {
    const c = src[s.i];
    const c2 = src[s.i + 1];
    if (c === "}" && depth === 0) return;
    if (c === "{") { depth++; s.out[s.i] = c; s.i++; prevMeaningful = "{"; continue; }
    if (c === "}") { depth--; s.out[s.i] = c; s.i++; prevMeaningful = "}"; continue; }
    if (c === "/" && c2 === "/") { maskLineComment(s); continue; }
    if (c === "/" && c2 === "*") { maskBlockComment(s); continue; }
    if (c === '"' || c === "'") { maskString(s, c); prevMeaningful = c; continue; }
    if (c === "`") { maskTemplate(s); prevMeaningful = "`"; continue; }
    if (c === "/" && isRegexContext(prevMeaningful)) { maskRegex(s); prevMeaningful = "/"; continue; }
    s.out[s.i] = c;
    if (!/\s/.test(c)) prevMeaningful = c;
    s.i++;
  }
}

function isRegexContext(prev: string): boolean {
  return REGEX_PRECEDING.test(prev);
}

function maskRegex(s: MaskState): void {
  const { src } = s;
  s.out[s.i] = "/"; s.i++;
  let inClass = false;
  while (s.i < src.length) {
    const ch = src[s.i];
    if (ch === "\\" && s.i + 1 < src.length) {
      s.out[s.i] = "x"; s.out[s.i + 1] = "x"; s.i += 2; continue;
    }
    if (ch === "\n") { s.out[s.i] = "\n"; s.i++; return; } // malformed; abort
    if (ch === "[") { inClass = true; s.out[s.i] = "x"; s.i++; continue; }
    if (ch === "]") { inClass = false; s.out[s.i] = "x"; s.i++; continue; }
    if (ch === "/" && !inClass) {
      s.out[s.i] = "/"; s.i++;
      // consume regex flags
      while (s.i < src.length && /[a-z]/i.test(src[s.i])) { s.out[s.i] = src[s.i]; s.i++; }
      return;
    }
    s.out[s.i] = "x"; s.i++;
  }
}

export function jsLexicalMask(src: string): string {
  const s = newState(src);
  let prevMeaningful = "";
  const { src: source } = s;
  while (s.i < source.length) {
    const c = source[s.i];
    const c2 = source[s.i + 1];
    if (c === "/" && c2 === "/") { maskLineComment(s); continue; }
    if (c === "/" && c2 === "*") { maskBlockComment(s); continue; }
    if (c === '"' || c === "'") { maskString(s, c); prevMeaningful = c; continue; }
    if (c === "`") { maskTemplate(s); prevMeaningful = "`"; continue; }
    if (c === "/" && isRegexContext(prevMeaningful)) { maskRegex(s); prevMeaningful = "/"; continue; }
    s.out[s.i] = c;
    if (!/\s/.test(c)) prevMeaningful = c;
    s.i++;
  }
  return s.out.join("");
}

/** True if a masked-source index falls inside code (i.e., not masked). */
export function isCodePosition(mask: string, raw: string, idx: number): boolean {
  return mask[idx] === raw[idx];
}
