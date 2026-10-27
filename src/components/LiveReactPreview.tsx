import * as React from "react";
import { AlertTriangle, Monitor, RefreshCw, Smartphone, TerminalSquare } from "lucide-react";
import type { FullAppFiles } from "@/lib/full-app-scaffold";
import { compileReactPreview } from "@/lib/react-preview";

interface Props {
  files: FullAppFiles;
  originalHtml: string;
  revision: string;
}
type Mode = "react" | "original";
type Device = "desktop" | "mobile";
type PreviewEvent = { ns?: string; nonce?: string; kind?: string; message?: string };

export function LiveReactPreview({ files, originalHtml, revision }: Props) {
  const [mode, setMode] = React.useState<Mode>("react");
  const [device, setDevice] = React.useState<Device>("desktop");
  const [iframeHtml, setIframeHtml] = React.useState("");
  const [previewStatus, setPreviewStatus] = React.useState("Preparing React preview...");
  const [messages, setMessages] = React.useState<string[]>([]);
  const [manualRevision, setManualRevision] = React.useState(0);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const nonceRef = React.useRef("");

  React.useEffect(() => {
    if (mode !== "react") return;
    let canceled = false;
    const timer = window.setTimeout(async () => {
      const nonce = crypto.randomUUID().replace(/-/g, "");
      nonceRef.current = nonce;
      setPreviewStatus("Compiling React and TypeScript...");
      setMessages([]);
      try {
        const result = await compileReactPreview(files, nonce);
        if (canceled) return;
        setIframeHtml(result.html);
        setPreviewStatus("Loading app modules...");
        if (result.warnings.length) setMessages(result.warnings.slice(0, 8));
      } catch (e) {
        if (canceled) return;
        const message = e instanceof Error ? e.message : "React compilation failed.";
        setIframeHtml("");
        setPreviewStatus("Preview compilation failed");
        setMessages([message]);
      }
    }, manualRevision ? 250 : 900);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [files, revision, mode, manualRevision]);

  React.useEffect(() => {
    if (mode !== "react") return;
    function onMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as PreviewEvent | null;
      if (!data || data.ns !== "obsidian.fullapp.preview.v1" ||
          data.nonce !== nonceRef.current || typeof data.message !== "string" ||
          !["ready", "error"].includes(data.kind ?? "")) return;
      if (data.kind === "ready") setPreviewStatus("React preview running");
      else {
        setPreviewStatus("Runtime issue");
        setMessages((m) => [...m.slice(-7), data.message!.slice(0, 350)]);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mode]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Full App preview type">
          <button type="button" role="tab" aria-selected={mode === "react"}
            className={mode === "react" ? "obs-btn-primary" : "obs-btn-ghost"}
            onClick={() => setMode("react")}>Live React app</button>
          <button type="button" role="tab" aria-selected={mode === "original"}
            className={mode === "original" ? "obs-btn-primary" : "obs-btn-ghost"}
            onClick={() => setMode("original")}>Original design</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="obs-btn-ghost" aria-label="Desktop preview"
            onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"}><Monitor size={14}/> Desktop</button>
          <button type="button" className="obs-btn-ghost" aria-label="Mobile preview"
            onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"}><Smartphone size={14}/> Mobile</button>
          <button type="button" className="obs-btn-ghost" onClick={() => setManualRevision((r) => r + 1)}
            disabled={mode !== "react"}><RefreshCw size={14}/> Reload React</button>
        </div>
      </div>

      <p role="status" className="mt-3 text-xs opacity-70">
        {mode === "react" ? previewStatus : "Original standalone HTML design"}
      </p>
      {mode === "react" && messages.length > 0 && (
        <details className="mt-3 rounded-lg border border-amber-500/30 p-3" open={previewStatus.includes("failed") || previewStatus === "Runtime issue"}>
          <summary className="cursor-pointer text-sm"><AlertTriangle size={14} className="mr-1 inline"/> Preview diagnostics ({messages.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {messages.map((m, i) => <li key={i} className="break-words font-mono">{m}</li>)}
          </ul>
        </details>
      )}
      <div className="mt-4 flex justify-center rounded-xl border border-white/10 bg-black/25 p-1">
        <iframe
          key={mode + ":" + (mode === "react" ? revision + ":" + manualRevision : "original")}
          ref={iframeRef}
          className="w-full rounded-lg border border-white/10 bg-white transition-[width] duration-200"
          style={{ height: "55vh", minHeight: 380, width: device === "mobile" ? 390 : "100%", maxWidth: "100%" }}
          title={mode === "react" ? "Isolated live React app preview" : "Original generated design"}
          srcDoc={mode === "react"
            ? iframeHtml || '<!doctype html><html><body style="font-family:system-ui;padding:24px">Compiling your React app...</body></html>'
            : originalHtml}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>
      <p className="mt-3 text-xs opacity-60">
        <TerminalSquare size={13} className="mr-1 inline"/>
        React preview transpiles editable files in your browser using isolated data modules. Dependencies load from esm.sh.
        No Obsidian login, private keys or backend credentials are injected. This is a preview, not a Vite production build.
        Live Supabase authentication requires separate deployment and configuration.
      </p>
    </div>
  );
}
