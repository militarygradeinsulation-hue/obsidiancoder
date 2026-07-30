// Obsidian Pocket — experimental, additive prompt-to-code workspace.
// Route: /forge. It does NOT replace the main Obsidian IDE at "/". Every
// capability here calls the real Obsidian pipeline (streaming /api/generate,
// the shared project model, the real entitlement/credit gate, the real cloud
// save + share endpoints, the real GitHub modal and outbound QA gate).
import { LandingAccordionItem } from "@/components/ui/interactive-image-accordion";
import * as React from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";

const GLSLHills = React.lazy(() => import("@/components/ui/glsl-hills"));
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  Code2,
  Copy,
  Download,
  Github,
  Loader2,
  Monitor,
  Rocket,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Wand2,
  Mic,
  MicOff,
  X,
  History,
} from "lucide-react";

import { authFetch } from "@/lib/auth-fetch";
import { useVoiceControl } from "@/lib/voice-control";
import { requirePaidAction } from "@/lib/action-guard";
import { useEntitlement, isPaidMode, refreshEntitlement } from "@/hooks/useEntitlement";
import { isAiErrorEnvelope } from "@/lib/ai-errors";
import { isCreditsRequiredEnvelope } from "@/lib/credit-gate";
import {
  resolveFromServer,
  resolveOnStatusError,
  shouldAllowDemoSubmit,
} from "@/lib/free-demo-status";
import { buildArtifact } from "@/lib/publish-artifact";
import { assessOutbound } from "@/lib/outbound-assess";
import { sanitizeForExport } from "@/lib/clean-export";
import { DEFAULT_MODEL, MODEL_REGISTRY, ROUTELLM_MODELS } from "@/lib/models";
import { updateContent, createFile, type Project } from "@/lib/project-model";
import { enhancePrompt } from "@/lib/enhance.functions";
import { safeGet, safeSet, sanitizeErrorMessage } from "@/lib/safe-storage";
import { getAccountCode, setAccountCode, isValidAccountCode } from "@/lib/account-code";
import { pushFeaturedDemo, deleteFeaturedDemo } from "@/lib/featured-demos.functions";
import { GithubModal } from "@/components/GithubModal";
import { PricingModal } from "@/components/PricingModal";
import {
  FORGE_DEVICES,
  deviceWidth,
  entryHtml,
  makeForgeVersion,
  projectFromHtml,
  pushVersion,
  setEntryHtml,
  titleFromPrompt,
  type ForgeDevice,
  type ForgeVersion,
} from "@/lib/forge/forge-state";

export const Route = createFileRoute("/pocket")({
  head: () => ({
    meta: [
      { title: "Obsidian Pocket — Prompt-to-Code Workspace" },
      {
        name: "description",
        content:
          "Obsidian Pocket workspace: one prompt, real multi-file projects, live preview, versions, and publishing on the Obsidian pipeline.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Obsidian Pocket — Prompt-to-Code Workspace" },
      {
        property: "og:description",
        content:
          "Type a prompt, generate real code, edit files, and preview instantly inside Obsidian.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgePage,
});

type BuildMode = "build" | "refine";
type TabId = "build" | "versions" | "settings";

interface LibraryBuild {
  id: string;
  title: string;
  prompt: string;
  created_at: string;
  share_slug?: string | null;
}

const EMPTY_DOC = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New project</title></head>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0c0f;color:#8b8f98;font-family:Inter,system-ui;font-size:14px">Describe what to build, then press Generate.</body></html>`;

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-[#B6BCC8] transition hover:border-[#F4A125]/40 hover:text-[#F4A125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-b from-[#F4A125] to-[#DD9324] px-4 py-2 text-sm font-semibold text-[#111317] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/70 disabled:cursor-not-allowed disabled:opacity-50";

function ForgePage() {
  const { snap } = useEntitlement();
  const paid = isPaidMode(snap.mode);

  const [project, setProject] = React.useState<Project>(() => projectFromHtml(EMPTY_DOC));
  const [activeFileId, setActiveFileId] = React.useState<string>(() => "");
  const [versions, setVersions] = React.useState<ForgeVersion[]>([]);
  const [prompt, setPrompt] = React.useState("");
  const [mode, setMode] = React.useState<BuildMode>("build");
  const [model, setModel] = React.useState<string>(
    () => safeGet<string>("forge.model") ?? DEFAULT_MODEL,
  );
  const [device, setDevice] = React.useState<ForgeDevice>("desktop");
  const [tab, setTab] = React.useState<TabId>("build");
  const [pane, setPane] = React.useState<"code" | "preview">("preview");
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [ghOpen, setGhOpen] = React.useState(false);
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [status, setStatus] = React.useState<string>("Ready");
  const [busy, setBusy] = React.useState<
    null | "generating" | "saving" | "enhancing" | "deploying"
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("Untitled build");
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);

  // Account code (entered at /unlock) is the default library code, so every
  // person's saved projects are scoped to them across browsers.
  const [libraryCode, setLibraryCode] = React.useState<string>(
    () => safeGet<string>("forge.libraryCode") || getAccountCode(),
  );

  const [library, setLibrary] = React.useState<LibraryBuild[]>([]);
  const [demoLive, setDemoLive] = React.useState<{ id: string; slug: string } | null>(null);

  /** Admin library code: full access to save, publish, export and Demos. */
  const isAdminCode = libraryCode.trim() === "9822";

  const [demoAvailable, setDemoAvailable] = React.useState<boolean | null>(null);
  const [demoUsed, setDemoUsed] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const promptRef = React.useRef<HTMLTextAreaElement>(null);
  const enhance = useServerFn(enhancePrompt);

  const html = entryHtml(project);
  const activeFile =
    project.files.find((f) => f.id === (activeFileId || project.entryFileId)) ?? project.files[0];
  const log = React.useCallback((line: string) => {
    setLogs((l) => [...l.slice(-99), `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  React.useEffect(() => {
    safeSet("forge.model", model);
  }, [model]);
  React.useEffect(() => {
    if (libraryCode) {
      safeSet("forge.libraryCode", libraryCode);
      // Keep the shared account code in sync so the main builder and Pocket
      // resolve the same personal library.
      setAccountCode(libraryCode);
    }
  }, [libraryCode]);


  // Free-demo eligibility — server is the source of truth.
  React.useEffect(() => {
    let alive = true;
    if (paid) {
      setDemoAvailable(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/public/free-demo/status", { credentials: "include" });
        const j = res.ok ? await res.json() : null;
        const r = j ? resolveFromServer(j) : resolveOnStatusError();
        if (!alive) return;
        setDemoAvailable(r.available);
        setDemoUsed(r.used);
      } catch {
        if (!alive) return;
        const r = resolveOnStatusError();
        setDemoAvailable(r.available);
        setDemoUsed(r.used);
      }
    })();
    return () => {
      alive = false;
    };
  }, [paid]);

  const demoMode = !paid && shouldAllowDemoSubmit({ demoAvailable, demoUsed });

  // Personal library (real builds rows, scoped by the user's library code).
  const loadLibrary = React.useCallback(async (code: string) => {
    const c = code.trim();
    if (c.length < 4) {
      setLibrary([]);
      return;
    }
    try {
      const res = await authFetch(`/api/public/library/${encodeURIComponent(c)}`);
      if (!res.ok) {
        setLibrary([]);
        return;
      }
      const j = (await res.json()) as { builds?: LibraryBuild[] };
      setLibrary(j.builds ?? []);
    } catch {
      setLibrary([]);
    }
  }, []);
  React.useEffect(() => {
    void loadLibrary(libraryCode);
  }, [libraryCode, loadLibrary]);

  const openLibraryBuild = React.useCallback(
    async (id: string) => {
      const c = libraryCode.trim();
      if (c.length < 4) return;
      setStatus("Opening project…");
      try {
        const res = await authFetch(`/api/public/library/${encodeURIComponent(c)}/${id}`);
        if (!res.ok) throw new Error(`Could not open project (${res.status})`);
        const j = (await res.json()) as { title?: string; prompt?: string; html?: string };
        const next = projectFromHtml(j.html ?? EMPTY_DOC);
        setProject(next);
        setActiveFileId(next.entryFileId);
        setTitle(j.title ?? "Untitled build");
        setPrompt("");
        setVersions((v) =>
          pushVersion(v, makeForgeVersion(j.html ?? "", `Opened · ${j.title ?? "project"}`)),
        );
        setStatus("Project loaded");
        setPane("preview");
        log(`Opened project ${id}`);
      } catch (err) {
        setError(sanitizeErrorMessage(err, "Could not open that project."));
        setStatus("Ready");
      }
    },
    [libraryCode, log],
  );

  const newProject = React.useCallback(() => {
    const next = projectFromHtml(EMPTY_DOC);
    setProject(next);
    setActiveFileId(next.entryFileId);
    setTitle("Untitled build");
    setPrompt("");
    setVersions([]);
    setShareUrl(null);
    setStatus("Ready");
    setPane("preview");
    promptRef.current?.focus();
  }, []);

  // ---- Real generation (streaming /api/generate) --------------------------
  const generate = React.useCallback(async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    if (!paid && !demoMode) {
      const guard = await requirePaidAction("generate_html");
      if (!guard.allowed) {
        setPricingOpen(true);
        return;
      }
    }
    setError(null);
    setBusy("generating");
    setStatus(demoMode ? "Generating your free demo build…" : "Generating…");
    setPane("preview");
    const controller = new AbortController();
    abortRef.current = controller;
    const previous = html;
    const t0 = performance.now();
    try {
      const res = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(demoMode ? { "x-obs-demo": "1" } : {}) },
        body: JSON.stringify({
          prompt: mode === "refine" ? `[FOCUSED CHANGE] ${p}` : p,
          currentHtml: mode === "refine" ? previous : previous.slice(0, 8000),
          history: [],
          model,
          pickerModel: model,
          advisory: false,
        }),
        signal: controller.signal,
      });

      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.includes("application/json")) {
        const envelope: unknown = await res.json().catch(() => null);
        if (isCreditsRequiredEnvelope(envelope)) {
          if (envelope.code === "free_demo_used") setDemoUsed(true);
          if (envelope.code === "free_demo_unavailable") setDemoAvailable(false);
          setPricingOpen(true);
          throw new Error(envelope.message);
        }
        if (isAiErrorEnvelope(envelope)) throw new Error(envelope.message);
        throw new Error(`Generation failed (${res.status})`);
      }
      if (!res.ok || !res.body) throw new Error(`Generation failed (${res.status})`);
      if (res.headers.get("x-obs-demo") === "1") log("Free demo claim committed server-side.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let lastPaint = 0;
      const clean = (s: string) =>
        s
          .replace(/\s*<!--OBS_(?:TIMING|PLACEHOLDERS):[\s\S]*?-->\s*$/g, "")
          .replace(/^```(?:html)?\s*/i, "")
          .replace(/```\s*$/i, "");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const now = performance.now();
        if (now - lastPaint > 140) {
          lastPaint = now;
          const partial = clean(acc);
          setProject((prev) => setEntryHtml(prev, partial));
        }
      }
      const finalHtml = clean(acc).trim();
      if (finalHtml.length < 40) throw new Error("The model returned an empty document.");
      setProject((prev) => setEntryHtml(prev, finalHtml));
      setVersions((v) => pushVersion(v, makeForgeVersion(finalHtml, titleFromPrompt(p))));
      if (title === "Untitled build") setTitle(titleFromPrompt(p));
      setStatus(`Built in ${Math.round(performance.now() - t0)}ms`);
      log(`Generated ${finalHtml.length.toLocaleString()} chars with ${model}`);
      if (demoMode) {
        setDemoUsed(true);
        setDemoAvailable(false);
        void refreshEntitlement();
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        setProject((prev) => setEntryHtml(prev, previous));
        setStatus("Stopped — preview unchanged");
      } else {
        setError(sanitizeErrorMessage(err, "Generation failed."));
        setStatus("Generation failed");
      }
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  }, [prompt, busy, paid, demoMode, html, mode, model, title, log]);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ---- Prompt enhancement (real server fn + credit gate) ------------------
  const runEnhance = React.useCallback(async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    const guard = await requirePaidAction("enhance_prompt");
    if (!guard.allowed) {
      setPricingOpen(true);
      return;
    }
    setBusy("enhancing");
    setStatus("Enhancing prompt…");
    try {
      const r = await enhance({ data: { prompt: p, hasHtml: html.length > 200 } });
      if ("paywall" in r) {
        setPricingOpen(true);
        setStatus("Ready");
        return;
      }
      setPrompt(r.prompt);
      setStatus("Prompt enhanced");
    } catch (err) {
      setError(sanitizeErrorMessage(err, "Could not enhance the prompt."));
    } finally {
      setBusy(null);
    }
  }, [prompt, busy, enhance, html]);

  // ---- Voice assist (same engine as the main Obsidian composer) -----------
  const voice = useVoiceControl({
    getDraft: () => promptRef.current?.value ?? prompt,
    onDictate: (_append, full) => {
      setPrompt(full);
      requestAnimationFrame(() => {
        const el = promptRef.current;
        if (!el) return;
        el.focus();
        try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
      });
    },
    onCommand: (cmd) => {
      const draft = (promptRef.current?.value ?? prompt).trim();
      switch (cmd) {
        case "send":
          if (!busy && draft) void generate();
          break;
        case "enhance":
        case "expand":
          if (!busy && draft) void runEnhance();
          break;
        case "clear":
          setPrompt("");
          requestAnimationFrame(() => promptRef.current?.focus());
          break;
        default:
          break;
      }
    },
  });

  // ---- Save to library (account code, or paid cloud_save gate) ------------
  const save = React.useCallback(async () => {
    if (busy || html.length < 40) return;
    const code = libraryCode.trim();
    // A valid account code scopes the project to that person's library and is
    // sufficient to save; otherwise fall back to the paid entitlement gate.
    if (!isValidAccountCode(code) && !isAdminCode) {
      const guard = await requirePaidAction("cloud_save");
      if (!guard.allowed) {
        setPricingOpen(true);
        return;
      }
    }

    setBusy("saving");
    setStatus("Saving…");
    setError(null);
    try {
      const res = await authFetch("/api/public/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt,
          html,
          model,
          library_code: libraryCode.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { id: string; share_slug: string };
      setShareUrl(`/api/public/share/${j.share_slug}`);
      setStatus("Saved to your library");
      log(`Saved build ${j.id}`);
      void loadLibrary(libraryCode);
    } catch (err) {
      setError(sanitizeErrorMessage(err, "Save failed."));
      setStatus("Save failed");
    } finally {
      setBusy(null);
    }
  }, [busy, html, title, prompt, model, libraryCode, loadLibrary, log]);

  // ---- Deploy (existing outbound QA gate → save → share URL) --------------
  const deploy = React.useCallback(async () => {
    if (busy || html.length < 40) return;
    if (!isAdminCode) {
      const guard = await requirePaidAction("cloud_publish");
      if (!guard.allowed) {
        setPricingOpen(true);
        return;
      }
    }
    const assessment = assessOutbound(html, { surface: "go-live" });
    if (!assessment.ok) {
      setError(`Publish blocked by QA gate: ${assessment.blockers.slice(0, 3).join(", ")}`);
      setStatus("Publish blocked");
      log(`Publish blocked: ${assessment.blockers.join(" | ")}`);
      return;
    }
    setBusy("deploying");
    setStatus("Publishing…");
    setError(null);
    try {
      const res = await authFetch("/api/public/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt,
          html: assessment.finalHtml,
          model,
          library_code: libraryCode.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { share_slug: string };
      const url = `${window.location.origin}/api/public/share/${j.share_slug}`;
      setShareUrl(url);
      setStatus("Live");
      log(`Published → ${url}`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(sanitizeErrorMessage(err, "Publish failed."));
      setStatus("Publish failed");
    } finally {
      setBusy(null);
    }
  }, [busy, html, title, prompt, model, libraryCode, log, isAdminCode]);

  // ---- Push to Demos (admin library code only) ---------------------------
  const pushToDemos = React.useCallback(async () => {
    if (!isAdminCode || busy || html.length < 40) return;
    // Toggle off when this build is already featured.
    if (demoLive) {
      setStatus("Removing from Demos…");
      try {
        const del = await deleteFeaturedDemo({ data: { adminCode: "9822", id: demoLive.id } });
        if ("ok" in del && del.ok) {
          setDemoLive(null);
          setStatus("Removed from Demos");
          log("Removed from public Demos gallery.");
        } else {
          setError("error" in del ? del.error : "Remove failed.");
        }
      } catch (err) {
        setError(sanitizeErrorMessage(err, "Remove failed."));
      }
      return;
    }
    const assessment = assessOutbound(html, { surface: "featured-demo" });
    if (!assessment.ok) {
      setError(`Demo push blocked by QA gate: ${assessment.blockers.slice(0, 3).join(", ")}`);
      setStatus("Demo push blocked");
      return;
    }
    setBusy("deploying");
    setStatus("Pushing to Demos…");
    setError(null);
    try {
      const res = await authFetch("/api/public/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt,
          html: assessment.finalHtml,
          model,
          library_code: "9822",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { share_slug: string };
      const url = `${window.location.origin}/api/public/share/${j.share_slug}`;
      const promoted = await pushFeaturedDemo({
        data: {
          adminCode: "9822",
          slug: j.share_slug,
          title: title || `Demo · ${j.share_slug}`,
          url,
        },
      });
      if (!("ok" in promoted) || !promoted.ok) {
        throw new Error("error" in promoted ? promoted.error : "promote failed");
      }
      setDemoLive({ id: promoted.id, slug: promoted.slug });
      setShareUrl(url);
      setStatus("Live on Demos");
      log(`Pushed to Demos → ${url}`);
    } catch (err) {
      setError(sanitizeErrorMessage(err, "Demo push failed."));
      setStatus("Demo push failed");
    } finally {
      setBusy(null);
    }
  }, [isAdminCode, busy, html, title, prompt, model, demoLive, log]);

  const exportProject = React.useCallback(async () => {
    if (!isAdminCode) {
      const guard = await requirePaidAction("cloud_share");
      if (!guard.allowed) {
        setPricingOpen(true);
        return;
      }
    }
    const blob = new Blob([sanitizeForExport(html)], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "obsidian-forge"}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Exported");
  }, [html, title, isAdminCode]);

  const openGithub = React.useCallback(async () => {
    if (!isAdminCode) {
      const guard = await requirePaidAction("github_deploy");
      if (!guard.allowed) {
        setPricingOpen(true);
        return;
      }
    }
    setGhOpen(true);
  }, [isAdminCode]);

  const restore = React.useCallback((v: ForgeVersion) => {
    setProject((prev) => setEntryHtml(prev, v.html));
    setStatus(`Restored “${v.label}”`);
    setPane("preview");
  }, []);

  // ---- Keyboard shortcuts -------------------------------------------------
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void generate();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAdvancedOpen((v) => !v);
      } else if (e.key === "/") {
        e.preventDefault();
        promptRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generate, save]);

  const srcDoc = React.useMemo(
    () =>
      buildArtifact({
        html: html || EMPTY_DOC,
        themeCss: null,
        themeName: null,
        surface: "preview",
      }).html,
    [html],
  );
  const frameWidth = deviceWidth(device);

  return (
    <div className="relative min-h-screen bg-[#08090b] text-[#E8E6E1]">
      {/* Animated GLSL hills background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <ClientOnly fallback={null}>
          <React.Suspense fallback={null}>
            <GLSLHills className="h-full w-full opacity-70" />
          </React.Suspense>
        </ClientOnly>
        <div className="absolute inset-0 bg-gradient-to-b from-[#08090b]/70 via-[#08090b]/55 to-[#08090b]/85" />
      </div>
      <div className="relative z-10">
      {/* Sticky compact header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0c0f]/90 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className={btn}
              aria-label={sidebarOpen ? "Hide projects" : "Show projects"}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <ChevronLeft size={14} className={sidebarOpen ? "" : "rotate-180"} />
            </button>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-b from-[#F4A125] to-[#DD9324] text-[11px] font-black text-[#111317]">
              OP
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight">Obsidian Pocket</h1>
              <p className="truncate text-[10px] uppercase tracking-widest text-[#6b7180]">
                Pocket workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-live="polite"
              className="hidden max-w-[220px] truncate text-xs text-[#B6BCC8] sm:inline"
            >
              {status}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() => setAdvancedOpen(true)}
              aria-haspopup="dialog"
            >
              <Settings2 size={13} /> Advanced
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside
            className="hidden w-60 shrink-0 border-r border-white/10 bg-[#0a0b0e] p-3 md:block"
            aria-label="Projects"
          >
            <button
              type="button"
              className={`${primaryBtn} w-full !py-1.5 !text-xs`}
              onClick={newProject}
            >
              New project
            </button>
            <label
              className="mt-4 block text-[10px] uppercase tracking-widest text-[#6b7180]"
              htmlFor="forge-lib"
            >
              Library code
            </label>
            <input
              id="forge-lib"
              value={libraryCode}
              onChange={(e) => setLibraryCode(e.target.value)}
              placeholder="e.g. 9822"
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-[#E8E6E1] placeholder:text-[#4b5060] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
            />
            <h2 className="mt-4 text-[10px] uppercase tracking-widest text-[#6b7180]">Projects</h2>
            <ul className="mt-2 space-y-1">
              {library.length === 0 && (
                <li className="text-xs text-[#5d626e]">No saved projects yet.</li>
              )}
              {library.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => void openLibraryBuild(b.id)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-[#B6BCC8] transition hover:bg-white/5 hover:text-[#F4A125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
                  >
                    {b.title || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <main className="min-w-0 flex-1 p-3">
          {/* Demo banner */}
          {!paid && (
            <div className="mb-3 rounded-lg border border-[#F4A125]/30 bg-[#F4A125]/[0.06] px-3 py-2 text-xs text-[#E8E6E1]">
              {demoMode
                ? "Free demo: one real build, no card. Saving, GitHub, full export, and publishing need an account."
                : "Your free demo is used. Sign in or upgrade to keep building, saving, and publishing."}
              <button
                type="button"
                className="ml-2 underline decoration-[#F4A125] underline-offset-2 hover:text-[#F4A125]"
                onClick={() => setPricingOpen(true)}
              >
                View plans
              </button>
            </div>
          )}

          {/* Empty-state hero */}
          {(versions.length === 0 && (!html || html.trim() === EMPTY_DOC.trim())) && (
            <section className="mb-3 rounded-2xl border border-white/10 bg-[#0b0c0f] p-5 sm:p-8">
              <LandingAccordionItem
                eyebrow="Obsidian Pocket"
                heading="Describe it once. Ship a real page."
                body="Clean, minimal, straight to the build. Type a prompt below and Pocket generates production-grade code you can edit, preview, and publish."
                ctaLabel="Start building"
                onCta={() => promptRef.current?.focus()}
              />
            </section>
          )}

          {/* Prompt composer */}

          <section className="rounded-xl border border-white/10 bg-[#0b0c0f] p-3 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]">
            <label htmlFor="forge-prompt" className="text-sm font-semibold">
              What should I build or change?
            </label>
            <textarea
              id="forge-prompt"
              ref={promptRef}
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A pricing page for an HVAC dispatch tool with three tiers and a comparison table…"
              className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-[#E8E6E1] placeholder:text-[#4b5060] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
            />
            {(voice.listening || voice.processing || voice.error) && (
              <p className="mt-2 text-xs text-[#F4A125]" role="status" aria-live="polite">
                {voice.error || voice.interim || (voice.processing ? "Transcribing…" : "Listening… say “send” to build")}
              </p>
            )}
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <label className="sr-only" htmlFor="forge-mode">
                  Build mode
                </label>
                <select
                  id="forge-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as BuildMode)}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-[#B6BCC8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
                >
                  <option value="build">Build new</option>
                  <option value="refine">Refine current</option>
                </select>
                <button
                  type="button"
                  className={btn}
                  onClick={() => void runEnhance()}
                  disabled={!!busy || !prompt.trim()}
                >
                  <Wand2 size={13} /> Enhance
                </button>
                {voice.supported && (
                  <button
                    type="button"
                    className={btn}
                    onClick={voice.toggle}
                    aria-pressed={voice.listening}
                    aria-label={voice.listening ? "Voice assist on — click to stop" : "Voice assist — dictate, say 'send' to build"}
                    title={voice.listening ? "Listening — say 'send' to build, 'enhance' to polish, 'clear' to reset" : "Voice assist"}
                    style={voice.listening ? { color: "#F4A125", borderColor: "rgba(244,161,37,0.55)", background: "rgba(244,161,37,0.14)" } : undefined}
                  >
                    {voice.listening ? <Mic size={13} /> : <MicOff size={13} />}
                    {voice.listening ? "Listening" : "Voice"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {busy === "generating" ? (
                  <button type="button" className={btn} onClick={stop}>
                    Stop
                  </button>
                ) : null}
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={() => void generate()}
                  disabled={!!busy || !prompt.trim()}
                >
                  {busy === "generating" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {busy === "generating" ? "Generating" : "Generate"}
                </button>
              </div>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300"
              >
                {error}
              </p>
            )}
          </section>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Workspace sections"
            className="mt-3 flex items-center gap-1"
          >
            {(
              [
                ["build", "Build"],
                ["versions", "Versions"],
                ["settings", "Settings"],
              ] as Array<[TabId, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                id={`forge-tab-${id}`}
                aria-controls={`forge-panel-${id}`}
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 ${tab === id ? "bg-[#F4A125]/15 text-[#F4A125]" : "text-[#B6BCC8] hover:bg-white/5"}`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className={btn} onClick={() => void save()} disabled={!!busy}>
                <Save size={13} /> Save
              </button>
              <button type="button" className={btn} onClick={() => void deploy()} disabled={!!busy}>
                <Rocket size={13} /> Publish
              </button>
            </div>
          </div>

          {/* Build panel */}
          {tab === "build" && (
            <section
              id="forge-panel-build"
              role="tabpanel"
              aria-labelledby="forge-tab-build"
              className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
            >
              {/* Code side */}
              <div
                className={`${pane === "code" ? "block" : "hidden"} lg:block rounded-xl border border-white/10 bg-[#0b0c0f]`}
              >
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                  <Code2 size={13} className="shrink-0 text-[#F4A125]" />
                  <label className="sr-only" htmlFor="forge-file">
                    File
                  </label>
                  <select
                    id="forge-file"
                    value={activeFile?.id ?? ""}
                    onChange={(e) => setActiveFileId(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-[#B6BCC8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
                  >
                    {project.files.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      const path = window.prompt("New file path", "styles.css");
                      if (!path) return;
                      const r = createFile(project, path);
                      if (!r.ok) {
                        setError(r.error);
                        return;
                      }
                      setProject(r.project);
                      setActiveFileId(r.fileId);
                    }}
                  >
                    New file
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      void navigator.clipboard.writeText(activeFile?.content ?? "");
                      setStatus("Copied");
                    }}
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
                <label className="sr-only" htmlFor="forge-editor">
                  Code editor
                </label>
                <textarea
                  id="forge-editor"
                  spellCheck={false}
                  value={activeFile?.content ?? ""}
                  onChange={(e) =>
                    activeFile && setProject((p) => updateContent(p, activeFile.id, e.target.value))
                  }
                  className="h-[52vh] w-full resize-none rounded-b-xl bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-[#cfd3db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F4A125]/60"
                />
              </div>

              {/* Preview side */}
              <div
                className={`${pane === "preview" ? "block" : "hidden"} lg:block rounded-xl border border-white/10 bg-[#0b0c0f]`}
              >
                <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
                  <span className="mr-auto truncate text-xs text-[#B6BCC8]">{title}</span>
                  {FORGE_DEVICES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={device === d.id}
                      aria-label={`${d.label} preview`}
                      onClick={() => setDevice(d.id)}
                      className={`rounded-md p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 ${device === d.id ? "bg-[#F4A125]/15 text-[#F4A125]" : "text-[#B6BCC8] hover:bg-white/5"}`}
                    >
                      {d.id === "desktop" ? (
                        <Monitor size={14} />
                      ) : d.id === "tablet" ? (
                        <Tablet size={14} />
                      ) : (
                        <Smartphone size={14} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex h-[52vh] justify-center overflow-auto bg-[#050608] p-2">
                  <iframe
                    title="Obsidian Pocket preview"
                    srcDoc={srcDoc}
                    sandbox="allow-scripts"
                    className="h-full w-full rounded-lg border border-white/10 bg-white"
                    style={frameWidth ? { maxWidth: `${frameWidth}px` } : undefined}
                  />
                </div>
              </div>

              {/* Mobile pane switch */}
              <div className="flex gap-1 lg:hidden">
                <button
                  type="button"
                  className={`${btn} flex-1 justify-center`}
                  aria-pressed={pane === "code"}
                  onClick={() => setPane("code")}
                >
                  Code
                </button>
                <button
                  type="button"
                  className={`${btn} flex-1 justify-center`}
                  aria-pressed={pane === "preview"}
                  onClick={() => setPane("preview")}
                >
                  Preview
                </button>
              </div>
            </section>
          )}

          {/* Versions panel */}
          {tab === "versions" && (
            <section
              id="forge-panel-versions"
              role="tabpanel"
              aria-labelledby="forge-tab-versions"
              className="mt-3 rounded-xl border border-white/10 bg-[#0b0c0f] p-3"
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <History size={14} className="text-[#F4A125]" /> Versions
              </h2>
              {versions.length === 0 ? (
                <p className="mt-2 text-xs text-[#5d626e]">
                  No versions yet — each successful generation records one.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs text-[#E8E6E1]">{v.label}</p>
                        <p className="text-[10px] text-[#5d626e]">
                          {new Date(v.at).toLocaleString()} · {v.html.length.toLocaleString()} chars
                        </p>
                      </div>
                      <button type="button" className={btn} onClick={() => restore(v)}>
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Settings panel */}
          {tab === "settings" && (
            <section
              id="forge-panel-settings"
              role="tabpanel"
              aria-labelledby="forge-tab-settings"
              className="mt-3 space-y-3 rounded-xl border border-white/10 bg-[#0b0c0f] p-3"
            >
              <div>
                <label htmlFor="forge-title" className="text-xs text-[#B6BCC8]">
                  Project title
                </label>
                <input
                  id="forge-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
                />
              </div>
              <p className="text-xs text-[#5d626e]">
                Account mode: <span className="text-[#B6BCC8]">{snap.mode}</span> · credits
                remaining: <span className="text-[#B6BCC8]">{snap.remaining}</span>
              </p>
              {shareUrl && (
                <p className="text-xs text-[#B6BCC8]">
                  Live URL:{" "}
                  <a
                    className="text-[#F4A125] underline underline-offset-2"
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shareUrl}
                  </a>
                </p>
              )}
              <p className="text-xs text-[#5d626e]">
                Shortcuts: ⌘/Ctrl+Enter generate · ⌘/Ctrl+S save · ⌘/Ctrl+K advanced · ⌘/Ctrl+/
                focus prompt
              </p>
            </section>
          )}
        </main>
      </div>

      {/* Advanced drawer */}
      {advancedOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Advanced controls"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdvancedOpen(false);
          }}
        >
          <div className="h-full w-full max-w-sm overflow-y-auto border-l border-white/10 bg-[#0b0c0f] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Advanced</h2>
              <button
                type="button"
                className={btn}
                onClick={() => setAdvancedOpen(false)}
                aria-label="Close advanced controls"
              >
                <X size={14} />
              </button>
            </div>

            <label
              htmlFor="forge-model"
              className="mt-4 block text-[10px] uppercase tracking-widest text-[#6b7180]"
            >
              Model
            </label>
            <select
              id="forge-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-[#B6BCC8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
            >
              <optgroup label="Obsidian gateway">
                {MODEL_REGISTRY.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="RouteLLM">
                {ROUTELLM_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            </select>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className={btn} onClick={() => void openGithub()}>
                <Github size={13} /> GitHub
              </button>
              <button type="button" className={btn} onClick={() => void exportProject()}>
                <Download size={13} /> Export
              </button>
              <button type="button" className={btn} onClick={() => void save()}>
                <Save size={13} /> Save
              </button>
              <button type="button" className={btn} onClick={() => void deploy()}>
                <Rocket size={13} /> Publish
              </button>
            </div>

            <h3 className="mt-5 text-[10px] uppercase tracking-widest text-[#6b7180]">Logs</h3>
            <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/50 p-2 font-mono text-[11px] leading-relaxed text-[#8b90a0]">
              {logs.length ? logs.join("\n") : "No activity yet."}
            </pre>
          </div>
        </div>
      )}

      <GithubModal
        open={ghOpen}
        onClose={() => setGhOpen(false)}
        currentHtml={html}
        defaultRepoName={title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "obsidian-forge"}
        onImport={(imported) => {
          setProject((p) => setEntryHtml(p, imported));
          setStatus("Imported from GitHub");
        }}
        onLog={log}
      />
      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
      </div>
    </div>
  );
}
