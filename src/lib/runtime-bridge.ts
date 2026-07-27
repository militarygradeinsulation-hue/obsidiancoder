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
  // Policy: generated controls may ONLY target in-document behavior. The
  // sole allowed URL-like target is '#existing-id'. Everything else — root
  // paths, relative paths, http(s), protocol-relative, mailto/tel/sms/data/
  // javascript/custom schemes, target=_blank, window.open, location writes
  // — is blocked. Forms always have their default browser navigation
  // cancelled (propagation is preserved so local submit listeners run).
  function isBlockedTarget(raw){
    if (!raw) return false;
    var s = String(raw).trim();
    if (!s) return false;
    // Only in-page fragments are allowed.
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
      send("navigation", "blocked target=_blank: " + labelFor(el), { url: el.getAttribute("href") || "" });
      return;
    }
    var href = el.getAttribute && el.getAttribute("href");
    var formaction = el.getAttribute && el.getAttribute("formaction");
    var target = href || formaction;
    if (!target) return;
    if (target.charAt(0) === "#") {
      var id = target.slice(1);
      if (!id) {
        // "#" placeholder — allow through but do not navigate.
        ev.preventDefault();
        return;
      }
      if (!document.getElementById(id) && !document.querySelector('[name="'+id.replace(/"/g,'\\\\"')+'"]')) {
        ev.preventDefault(); ev.stopPropagation();
        markBlocked(el, "missing anchor #" + id);
        send("navigation", "blocked missing anchor: " + labelFor(el), { url: target });
      }
      return;
    }
    if (isBlockedTarget(target)) {
      ev.preventDefault(); ev.stopPropagation();
      markBlocked(el, "off-page link");
      send("navigation", "blocked link: " + labelFor(el), { url: target });
    }
  }, true);
  document.addEventListener("submit", function(ev){
    var f = ev.target;
    if (!f || f.tagName !== "FORM") return;
    // Always cancel the default browser navigation. Do NOT stopPropagation
    // — local submit listeners on the same form must still be able to
    // update in-document state.
    ev.preventDefault();
    var action = f.getAttribute("action") || "";
    if (action && isBlockedTarget(action)) {
      send("navigation", "blocked form action: " + labelFor(f), { url: action });
    }
  }, true);
  try {
    window.open = function(){ send("navigation", "blocked window.open", { url: String(arguments[0]||"") }); return null; };
  } catch(_){}
  // Location writes: Location methods are not always writable. We install
  // best-effort interceptors AND rely on pre-render sanitization by the
  // publish-artifact builder for authoritative safety.
  try {
    ["assign","replace"].forEach(function(k){
      var orig = location[k] && location[k].bind(location);
      if (!orig) return;
      try {
        Object.defineProperty(location, k, {
          configurable: true,
          value: function(u){ if (isBlockedTarget(u)) { send("navigation", "blocked location."+k, { url: String(u||"") }); return; } return orig(u); },
        });
      } catch(_){}
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
