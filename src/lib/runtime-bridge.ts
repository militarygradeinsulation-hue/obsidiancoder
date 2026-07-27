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
  | "navigation";

export type RuntimeEvent = {
  kind: RuntimeEventKind;
  message: string;
  url?: string;
  status?: number;
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
  const KINDS: RuntimeEventKind[] = ["ready", "console-error", "console-warn", "unhandled-error", "unhandled-rejection", "asset-failed", "fetch-failed", "navigation"];
  if (typeof kind !== "string" || !KINDS.includes(kind as RuntimeEventKind)) return null;
  return {
    kind: kind as RuntimeEventKind,
    message: safeStr((data as { message?: unknown }).message, MAX_MSG),
    url: safeStr((data as { url?: unknown }).url, MAX_URL) || undefined,
    status: typeof (data as { status?: unknown }).status === "number" ? (data as { status: number }).status : undefined,
    ts: Date.now(),
  };
}

/** Guest-side: JS blob to inject at the top of the previewed HTML. */
export const RUNTIME_BRIDGE_SCRIPT = `
(function(){
  var NS = "${NS}";
  function send(kind, message, extra){
    try {
      var payload = Object.assign({ ns: NS, kind: kind, message: String(message).slice(0, ${MAX_MSG}) }, extra || {});
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
  // Same-document allowed: hash anchors whose target actually exists,
  // clicks that fire local handlers, form submits that fire local
  // listeners (we cancel only the default browser navigation).
  var CREATOR_HOSTS = /(?:^|\\.)(?:obsidianvibe\\.live|lovable\\.app)$/i;
  var BLOCKED_PATHS = /^\\/(?:$|dashboard|gallery|demos|unlock|auth|checkout|admin|index(?:\\.html)?$)/i;
  function isBlockedTarget(raw){
    if (!raw) return false;
    var s = String(raw).trim();
    if (!s) return false;
    if (s.charAt(0) === "#") return false;
    if (/^(mailto:|tel:|sms:|data:|javascript:)/i.test(s)) return true;
    if (s.slice(0,2) === "//") { try { var u1 = new URL("https:" + s); return CREATOR_HOSTS.test(u1.host) || BLOCKED_PATHS.test(u1.pathname) || true; } catch(_){ return true; } }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(s)) { try { var u2 = new URL(s); if (CREATOR_HOSTS.test(u2.host)) return true; return true; } catch(_){ return true; } }
    if (s.charAt(0) === "/") { try { var u3 = new URL(s, location.origin); return BLOCKED_PATHS.test(u3.pathname); } catch(_){ return true; } }
    var head = s.split(/[\\/?#]/)[0].toLowerCase();
    if (["dashboard","gallery","demos","unlock","auth","checkout","admin"].indexOf(head) >= 0) return true;
    return false;
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
      send("navigation", "blocked target=_blank: " + labelFor(el), { url: el.getAttribute("href") || "" });
      return;
    }
    var href = el.getAttribute && el.getAttribute("href");
    var formaction = el.getAttribute && el.getAttribute("formaction");
    var target = href || formaction;
    if (!target) return;
    if (target.charAt(0) === "#") {
      var id = target.slice(1);
      if (id && !document.getElementById(id) && !document.querySelector('[name="'+id.replace(/"/g,'\\\\"')+'"]')) {
        ev.preventDefault(); ev.stopPropagation();
        markBlocked(el, "missing anchor #" + id);
        send("navigation", "blocked missing anchor: " + labelFor(el), { url: target });
      }
      return;
    }
    if (isBlockedTarget(target)) {
      ev.preventDefault(); ev.stopPropagation();
      markBlocked(el, "external/creator link");
      send("navigation", "blocked link: " + labelFor(el), { url: target });
    }
  }, true);
  document.addEventListener("submit", function(ev){
    var f = ev.target;
    if (!f || f.tagName !== "FORM") return;
    var action = f.getAttribute("action") || "";
    if (isBlockedTarget(action) || (!action && f.method && f.method.toLowerCase() !== "get")) {
      // Cancel only the default browser navigation; user's own submit
      // listener (added on the same element) still runs.
      ev.preventDefault();
      send("navigation", "blocked form submit: " + labelFor(f), { url: action });
    }
  }, true);
  try {
    var _open = window.open;
    window.open = function(){ send("navigation", "blocked window.open", { url: String(arguments[0]||"") }); return null; };
    void _open;
  } catch(_){}
  try {
    ["assign","replace"].forEach(function(k){
      var orig = location[k] && location[k].bind(location);
      if (!orig) return;
      location[k] = function(u){ if (isBlockedTarget(u)) { send("navigation", "blocked location."+k, { url: String(u||"") }); return; } return orig(u); };
    });
  } catch(_){}

  send("ready", "preview ready");
})();
`;

/** Inject the bridge before the closing </head> (or prepend if absent). */
export function injectRuntimeBridge(html: string): string {
  if (!html) return html;
  const tag = `<script>${RUNTIME_BRIDGE_SCRIPT}</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`);
  return `${tag}${html}`;
}
