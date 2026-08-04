// Sanitized iframe postMessage protocol. The preview iframe posts diagnostic
// events (console errors, unhandled rejections, failed assets, fetch failures,
// navigation) up to the host. The host validates the schema AND source origin
// before accepting anything. No arbitrary structured payloads are trusted.

export type RuntimeEventKind =
  | "ready"
  | "console-error"
  | "console-warn"
  | "unhandled-error"
  | "unhandled-rejection"
  | "asset-failed"
  | "fetch-failed"
  | "navigation"
  | "blocked-navigation"
  | "mobile-overflow"
  | "content-summary";

export type RuntimeEvent = {
  kind: RuntimeEventKind;
  message: string;
  url?: string;
  status?: number;
  /** Build hash the guest was rendered for. Host uses this to decide whether
   *  this event belongs to the CURRENT committed build. */
  buildHash?: string;
  /** Optional numeric payload (overflowPx for mobile-overflow, chars/nodes for content-summary). */
  n?: number;
  ts: number;
};

const NS = "obsidian.runtime";
const MAX_MSG = 500;
const MAX_URL = 500;

function safeStr(v: unknown, cap: number): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  return s.replace(/https?:\/\/\S+/g, (u) => u.slice(0, 120))
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .slice(0, cap);
}

/** Host-side: validate an incoming MessageEvent. Returns null on rejection. */
export function parseRuntimeMessage(evt: MessageEvent, expectedSource?: Window | null): RuntimeEvent | null {
  if (expectedSource && evt.source !== expectedSource) return null;
  const data = evt.data;
  if (!data || typeof data !== "object") return null;
  if ((data as { ns?: unknown }).ns !== NS) return null;
  const kind = (data as { kind?: unknown }).kind;
  const KINDS: RuntimeEventKind[] = [
    "ready", "console-error", "console-warn", "unhandled-error", "unhandled-rejection",
    "asset-failed", "fetch-failed", "navigation",
    "blocked-navigation", "mobile-overflow", "content-summary",
  ];
  if (typeof kind !== "string" || !KINDS.includes(kind as RuntimeEventKind)) return null;
  const rawN = (data as { n?: unknown }).n;
  const rawHash = (data as { buildHash?: unknown }).buildHash;
  return {
    kind: kind as RuntimeEventKind,
    message: safeStr((data as { message?: unknown }).message, MAX_MSG),
    url: safeStr((data as { url?: unknown }).url, MAX_URL) || undefined,
    status: typeof (data as { status?: unknown }).status === "number" ? (data as { status: number }).status : undefined,
    buildHash: typeof rawHash === "string" ? rawHash.slice(0, 32) : undefined,
    n: typeof rawN === "number" && Number.isFinite(rawN) ? rawN : undefined,
    ts: Date.now(),
  };
}

/** Dedup key for a runtime event — collapse repeated identical events per build. */
export function runtimeEventDedupKey(e: RuntimeEvent): string {
  return [e.buildHash ?? "-", e.kind, e.message, e.url ?? "", e.status ?? "", e.n ?? ""].join("|");
}

/**
 * Filter events belonging to the CURRENT build hash. Events without a hash
 * are treated as legacy/unattributed and included (backward compatible).
 */
export function eventsForBuild(events: RuntimeEvent[], buildHash: string): RuntimeEvent[] {
  if (!buildHash) return events;
  return events.filter((e) => !e.buildHash || e.buildHash === buildHash);
}


/** Guest-side: JS blob to inject at the top of the previewed HTML.
 *  Callers should use `buildRuntimeBridgeScript({ buildHash })` so events
 *  emitted by the guest carry the build fingerprint. The exported
 *  `RUNTIME_BRIDGE_SCRIPT` constant is kept for backward compatibility
 *  and uses an empty buildHash. */
export function buildRuntimeBridgeScript(opts: { buildHash?: string } = {}): string {
  const bh = (opts.buildHash ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `
(function(){
  var NS = "${NS}";
  var BUILD_HASH = ${JSON.stringify(bh)};
  function send(kind, message, extra){
    try {
      var payload = Object.assign({ ns: NS, kind: kind, buildHash: BUILD_HASH, message: String(message).slice(0, ${MAX_MSG}) }, extra || {});
      parent.postMessage(payload, "*");
    } catch (_){}
  }
  window.addEventListener("error", function(e){
    if (e && e.target && e.target !== window && (e.target.src || e.target.href)) {
      send("asset-failed", "asset failed to load", { url: (e.target.src || e.target.href) });
    } else {
      send("unhandled-error", (e && e.message) || "unhandled error", { url: e && e.filename });
    }
  }, true);
  window.addEventListener("unhandledrejection", function(e){
    var m = "";
    try { m = (e && e.reason && (e.reason.message || e.reason)) + ""; } catch(_){ m = "unhandled rejection"; }
    send("unhandled-rejection", m);
  });
  var _e = console.error, _w = console.warn;
  console.error = function(){ try { send("console-error", Array.from(arguments).join(" ")); } catch(_){}; return _e.apply(console, arguments); };
  console.warn  = function(){ try { send("console-warn",  Array.from(arguments).join(" ")); } catch(_){}; return _w.apply(console, arguments); };
  var _f = window.fetch;
  if (_f) {
    window.fetch = function(input, init){
      var url = typeof input === "string" ? input : (input && input.url);
      return _f(input, init).then(function(res){
        if (!res.ok) send("fetch-failed", "fetch " + res.status, { url: url, status: res.status });
        return res;
      }).catch(function(err){ send("fetch-failed", (err && err.message) || "fetch error", { url: url }); throw err; });
    };
  }

  // ---- Navigation firewall (defect #1) --------------------------------
  function isBlockedTarget(raw){
    if (!raw) return false;
    var s = String(raw).trim();
    if (!s) return false;
    if (s.charAt(0) === "#") return false;
    return true;
  }
  function labelFor(el){
    try {
      var t = (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"))) || el.textContent || el.value || "";
      return String(t).replace(/\\s+/g," ").trim().slice(0,80);
    } catch(_){ return ""; }
  }
  function markBlocked(el, reason){
    try {
      el.setAttribute("data-obsidian-blocked","1");
      el.setAttribute("aria-disabled","true");
      if (el.style){ el.style.opacity = "0.55"; el.style.cursor = "not-allowed"; }
      el.title = "Blocked: " + reason;
    } catch(_){}
  }
  document.addEventListener("click", function(ev){
    var el = ev.target && ev.target.closest ? ev.target.closest("a,button,[role=link],[role=button]") : null;
    if (!el) return;
    if (el.getAttribute && el.getAttribute("target") === "_blank") {
      ev.preventDefault(); ev.stopPropagation();
      markBlocked(el, "target=_blank");
      send("blocked-navigation", "blocked target=_blank: " + labelFor(el), { url: el.getAttribute("href") || "" });
      return;
    }
    var href = el.getAttribute && el.getAttribute("href");
    var formaction = el.getAttribute && el.getAttribute("formaction");
    var target = href || formaction;
    if (!target) return;
    if (target.charAt(0) === "#") {
      var id = target.slice(1);
      if (!id) { ev.preventDefault(); return; }
      if (!document.getElementById(id) && !document.querySelector('[name="'+id.replace(/"/g,'\\\\"')+'"]')) {
        ev.preventDefault(); ev.stopPropagation();
        markBlocked(el, "missing anchor #" + id);
        send("blocked-navigation", "blocked missing anchor: " + labelFor(el), { url: target });
      }
      return;
    }
    if (isBlockedTarget(target)) {
      ev.preventDefault(); ev.stopPropagation();
      markBlocked(el, "off-page link");
      send("blocked-navigation", "blocked link: " + labelFor(el), { url: target });
    }
  }, true);
  document.addEventListener("submit", function(ev){
    var f = ev.target;
    if (!f || f.tagName !== "FORM") return;
    ev.preventDefault();
    var action = f.getAttribute("action") || "";
    if (action && isBlockedTarget(action)) {
      send("blocked-navigation", "blocked form action: " + labelFor(f), { url: action });
    }
  }, true);
  try {
    window.open = function(){ send("blocked-navigation", "blocked window.open", { url: String(arguments[0]||"") }); return null; };
  } catch(_){}
  try {
    ["assign","replace"].forEach(function(k){
      var orig = location[k] && location[k].bind(location);
      if (!orig) return;
      try {
        Object.defineProperty(location, k, {
          configurable: true,
          value: function(u){ if (isBlockedTarget(u)) { send("blocked-navigation", "blocked location."+k, { url: String(u||"") }); return; } return orig(u); },
        });
      } catch(_){}
    });
  } catch(_){}

  // ---- Content summary (free telemetry) --------------------------------
  function contentSummary(){
    try {
      var body = document.body || document.documentElement;
      var chars = (body && body.innerText ? body.innerText.length : 0) | 0;
      var nodes = document.querySelectorAll("*").length | 0;
      send("content-summary", "chars=" + chars + " nodes=" + nodes, { n: chars });
    } catch(_){}
  }
  // ---- Mobile overflow monitor (free telemetry) ------------------------
  var overflowTimer = null;
  function checkOverflow(){
    try {
      var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      var sw = document.documentElement.scrollWidth || 0;
      if (vw > 0 && sw > vw + 1) {
        send("mobile-overflow", "content overflows viewport by " + (sw - vw) + "px", { n: sw - vw });
      }
    } catch(_){}
  }
  function scheduleOverflow(){
    if (overflowTimer) return;
    overflowTimer = setTimeout(function(){ overflowTimer = null; checkOverflow(); }, 250);
  }
  window.addEventListener("resize", scheduleOverflow, { passive: true });
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(function(){ contentSummary(); checkOverflow(); }, 0);
  } else {
    window.addEventListener("DOMContentLoaded", function(){ contentSummary(); checkOverflow(); });
  }

  // ---- ObsidianMemory (Cloud Memory bridge) ---------------------------
  // window.ObsidianMemory.{get,set,list,delete} — shared across everyone
  // viewing this build when Cloud Memory is on. Falls back to localStorage
  // when the host does not answer (offline / memory off).
  (function(){
    var MEM_NS = "obsidian.memory";
    var pending = {};
    var seq = 0;
    var LS = "obs.mem.local.";
    function localGet(k){ try { var v = localStorage.getItem(LS + k); return v == null ? null : JSON.parse(v); } catch(_){ return null; } }
    function localSet(k, v){ try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch(_){} return true; }
    function localDel(k){ try { localStorage.removeItem(LS + k); } catch(_){} return true; }
    function localList(){
      var out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(LS) === 0) out.push({ key: k.slice(LS.length), value: localGet(k.slice(LS.length)) });
        }
      } catch(_){}
      return out;
    }
    window.addEventListener("message", function(ev){
      var d = ev && ev.data;
      if (!d || typeof d !== "object" || d.ns !== MEM_NS || d.type !== "reply") return;
      var p = pending[d.id];
      if (!p) return;
      delete pending[d.id];
      clearTimeout(p.t);
      p.resolve(d.ok ? d.data : p.fallback());
    });
    function call(op, key, value, fallback){
      return new Promise(function(resolve){
        var id = MEM_NS + ":" + (++seq) + ":" + Date.now();
        var t = setTimeout(function(){ delete pending[id]; resolve(fallback()); }, 2500);
        pending[id] = { resolve: resolve, t: t, fallback: fallback };
        try {
          parent.postMessage({ ns: MEM_NS, type: "req", id: id, op: op, key: key, value: value }, "*");
        } catch(_){ clearTimeout(t); delete pending[id]; resolve(fallback()); }
      });
    }
    window.ObsidianMemory = {
      cloud: false,
      get:    function(key){ return call("get", String(key), undefined, function(){ return localGet(String(key)); }); },
      set:    function(key, value){ return call("set", String(key), value, function(){ return localSet(String(key), value); }); },
      delete: function(key){ return call("delete", String(key), undefined, function(){ return localDel(String(key)); }); },
      list:   function(){ return call("list", undefined, undefined, function(){ return localList(); }); },
      onChange: function(fn){
        window.addEventListener("message", function(ev){
          var d = ev && ev.data;
          if (d && d.ns === MEM_NS && d.type === "changed" && typeof fn === "function") fn(d.key, d.value);
        });
      }
    };
    try {
      parent.postMessage({ ns: MEM_NS, type: "hello" }, "*");
    } catch(_){}
  })();

  send("ready", "preview ready");
})();
`;
}

/** Backward-compatible constant script (no buildHash). Prefer buildRuntimeBridgeScript. */
export const RUNTIME_BRIDGE_SCRIPT = buildRuntimeBridgeScript();

/** Inject the bridge before the closing </head> (or prepend if absent).
 *  Pass `buildHash` so guest-emitted events carry the current build fingerprint. */
export function injectRuntimeBridge(html: string, opts: { buildHash?: string } = {}): string {
  if (!html) return html;
  const body = buildRuntimeBridgeScript(opts);
  const tag = `<script>${body}</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`);
  return `${tag}${html}`;
}


/* ------------------------------------------------------------------------
 * ObsidianMemory host protocol — the sandboxed build asks the host to read
 * and write shared records. The host decides where those go (cloud when
 * Cloud Memory is on, nowhere otherwise). Payloads are validated here.
 * ---------------------------------------------------------------------- */

export const MEMORY_NS = "obsidian.memory";

export type MemoryOp = "get" | "set" | "delete" | "list";

export interface MemoryRequest {
  id: string;
  op: MemoryOp;
  key?: string;
  value?: unknown;
}

const MEMORY_OPS: MemoryOp[] = ["get", "set", "delete", "list"];

/** Host-side: validate an incoming ObsidianMemory request. Null on rejection. */
export function parseMemoryMessage(
  evt: MessageEvent,
  expectedSource?: Window | null,
): MemoryRequest | null {
  if (expectedSource && evt.source !== expectedSource) return null;
  const d = evt.data as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  if (d["ns"] !== MEMORY_NS || d["type"] !== "req") return null;
  const id = d["id"];
  const op = d["op"];
  if (typeof id !== "string" || id.length === 0 || id.length > 120) return null;
  if (typeof op !== "string" || !MEMORY_OPS.includes(op as MemoryOp)) return null;
  const rawKey = d["key"];
  const key = typeof rawKey === "string" ? rawKey.slice(0, 200) : undefined;
  if ((op === "get" || op === "set" || op === "delete") && !key) return null;
  return { id, op: op as MemoryOp, key, value: d["value"] };
}

/** Host-side: the reply envelope to post back into the frame. */
export function memoryReply(id: string, ok: boolean, data: unknown) {
  return { ns: MEMORY_NS, type: "reply" as const, id, ok, data };
}

/** Host-side: push a remote change into the frame. */
export function memoryChanged(key: string, value: unknown) {
  return { ns: MEMORY_NS, type: "changed" as const, key, value };
}
