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
