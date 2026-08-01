// Obsidian Pocket — experimental, additive prompt-to-code workspace.
// Route: /forge. It does NOT replace the main Obsidian IDE at "/". Every
// capability here calls the real Obsidian pipeline (streaming /api/generate,
// the shared project model, the real entitlement/credit gate, the real cloud
// save + share endpoints, the real GitHub modal and outbound QA gate).
import * as React from "react";
import { createFileRoute, ClientOnly, useNavigate } from "@tanstack/react-router";

import { PocketBackground } from "@/components/PocketBackground";
import pocketLogo from "@/assets/aetheris-logo.png.asset.json";

import { AetherisInstructor } from "@/components/AetherisInstructor";

import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  Code2,
  Copy,
  Download,
  Github,
  Home,
  Library,
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
import { useEntitlement, isPaidMode } from "@/hooks/useEntitlement";
import { isAiErrorEnvelope } from "@/lib/ai-errors";
import { isCreditsRequiredEnvelope } from "@/lib/credit-gate";
import { buildArtifact } from "@/lib/publish-artifact";
import { assessOutbound } from "@/lib/outbound-assess";
import { sanitizeForExport } from "@/lib/clean-export";
import { DEFAULT_MODEL, MODEL_REGISTRY, ROUTELLM_MODELS } from "@/lib/models";
import { updateContent, createFile, type Project } from "@/lib/project-model";
import { enhancePrompt } from "@/lib/enhance.functions";
import { suggestAddons, type Addon } from "@/lib/prompt-enhance";
import { generateStarterIdeas } from "@/lib/ideas.functions";
import { suggestionAllowed } from "@/lib/suggestion-safety";


import { safeGet, safeSet, sanitizeErrorMessage } from "@/lib/safe-storage";
import { getAccountCode, setAccountCode, isFullAccessCode } from "@/lib/account-code";
import { pushFeaturedDemo, deleteFeaturedDemo } from "@/lib/featured-demos.functions";
import { GithubModal } from "@/components/GithubModal";
import { PocketPreviewFrame } from "@/components/PocketPreviewFrame";
import { PocketBuildOrb } from "@/components/PocketBuildOrb";

import { PricingModal } from "@/components/PricingModal";
import { POCKET_MONTHLY_BUILDS } from "@/lib/plans";
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

const POCKET_IDEA_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "all", label: "All ideas" },
  { id: "ai", label: "AI" },
  { id: "app", label: "App" },
  { id: "game", label: "Game" },
  { id: "productivity", label: "Productivity" },
  { id: "education", label: "Education" },
  { id: "presentation", label: "Presentation" },
  { id: "landing", label: "Landing page" },
  { id: "dashboard", label: "Dashboard" },
  { id: "portfolio", label: "Portfolio" },
];


const EMPTY_DOC = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New project</title></head>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0c0f;color:#8b8f98;font-family:Inter,system-ui;font-size:14px">Describe what to build, then press Generate.</body></html>`;

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-[#B6BCC8] transition hover:border-[#F4A125]/40 hover:text-[#F4A125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-b from-[#F4A125] to-[#DD9324] px-4 py-2 text-sm font-semibold text-[#111317] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/70 disabled:cursor-not-allowed disabled:opacity-50";

function ForgePage() {
  const navigate = useNavigate();
  const { snap } = useEntitlement();
  const paid = isPaidMode(snap.mode);

  const [project, setProject] = React.useState<Project>(() => projectFromHtml(EMPTY_DOC));
  const [activeFileId, setActiveFileId] = React.useState<string>(() => "");
  const [versions, setVersions] = React.useState<ForgeVersion[]>([]);
  const [prompt, setPrompt] = React.useState("");
  const [ideaOffset, setIdeaOffset] = React.useState(0);
  const [ideaCategory, setIdeaCategory] = React.useState("all");
  const [aiIdeas, setAiIdeas] = React.useState<Addon[]>([]);
  const [aiIdeasLoading, setAiIdeasLoading] = React.useState(false);
  const seenIdeasRef = React.useRef<Set<string>>(new Set());
  const genIdeas = useServerFn(generateStarterIdeas);
  const baseIdeas = React.useMemo(
    () => suggestAddons(prompt, false, ideaOffset, 7),
    [prompt, ideaOffset],
  );
  const ideaChips = React.useMemo(
    () => (!prompt.trim() && aiIdeas.length ? aiIdeas.slice(0, 6) : baseIdeas),
    [prompt, aiIdeas, baseIdeas],
  );
  const loadCategoryIdeas = React.useCallback(
    async (category: string) => {
      setAiIdeasLoading(true);
      try {
        const exclude = Array.from(seenIdeasRef.current).slice(-120);
        const res = await genIdeas({ data: { exclude, count: 8, category: category as never } });
        const allowTrades = category === "trades";
        const fresh = (res.ideas ?? [])
          .filter((i) => suggestionAllowed(`${i.label} ${i.snippet}`, allowTrades))
          .map((i) => ({ id: i.id, label: i.label, snippet: i.snippet }) as Addon);
        fresh.forEach((f) => seenIdeasRef.current.add(f.label.toLowerCase()));
        setAiIdeas(fresh);
      } catch {
        setAiIdeas([]);
      } finally {
        setAiIdeasLoading(false);
      }
    },
    [genIdeas],
  );



  const [mode, setMode] = React.useState<BuildMode>("build");
  const [model, setModel] = React.useState<string>(DEFAULT_MODEL);

  const [device, setDevice] = React.useState<ForgeDevice>("desktop");
  const [tab, setTab] = React.useState<TabId>("build");
  const [pane, setPane] = React.useState<"code" | "preview">("preview");
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [ghOpen, setGhOpen] = React.useState(false);
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [status, setStatus] = React.useState<string>("Ready");
  // Bumped on Clear all so the sandbox iframe remounts blank even if a
  // streaming load was aborted mid-swap.
  const [previewNonce, setPreviewNonce] = React.useState(0);
  const [busy, setBusy] = React.useState<
    null | "generating" | "saving" | "enhancing" | "deploying"
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("Untitled build");
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = React.useState<string | null>(null);


  // Account code (entered at /unlock) is the default library code, so every
  // person's saved projects are scoped to them across browsers.
  // Read after mount so SSR and the first client render agree (no hydration
  // mismatch from localStorage-derived UI such as the admin-only actions).
  const [libraryCode, setLibraryCode] = React.useState<string>("");
  React.useEffect(() => {
    const stored = safeGet<string>("forge.libraryCode") || getAccountCode();
    if (stored) setLibraryCode(stored);
    const storedModel = safeGet<string>("forge.model");
    if (storedModel) setModel(storedModel);
  }, []);


  const [library, setLibrary] = React.useState<LibraryBuild[]>([]);
  const [demoLive, setDemoLive] = React.useState<{ id: string; slug: string } | null>(null);
  /** Set once this build has been shared into the public community library. */
  const [inCommunity, setInCommunity] = React.useState<{ id: string; slug: string } | null>(null);

  /** Admin library code: full access to save, publish, export and Demos. */
  const isAdminCode = isFullAccessCode(libraryCode);
  /** Paid Pocket access: an active subscription, or the admin library code. */
  const paidAccess = paid || isAdminCode;
  const buildsLeft = snap.builds && snap.builds.cap > 0 ? snap.builds : null;
  const requireAccount = React.useCallback((what: string) => {
    setError(`${what} needs an Obsidian Pocket account — $10/month for ${POCKET_MONTHLY_BUILDS} builds, saving, and code export.`);
    setPricingOpen(true);
  }, []);


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

  // ---- Active session memory (per library code, survives reloads) --------
  type PocketSession = {
    html: string;
    title: string;
    prompt: string;
    versions: ForgeVersion[];
    at: number;
  };
  const sessionKey = React.useCallback(
    (code: string) => `pocket.session.${(code || "guest").trim() || "guest"}`,
    [],
  );
  const restoredRef = React.useRef<string>("");

  const restoreSession = React.useCallback(
    (code: string) => {
      const saved = safeGet<PocketSession>(sessionKey(code));
      if (!saved?.html || saved.html.length < 40) return false;
      const next = projectFromHtml(saved.html);
      setProject(next);
      setActiveFileId(next.entryFileId);
      setTitle(saved.title || "Untitled build");
      setPrompt(saved.prompt || "");
      setVersions(saved.versions ?? []);
      setPane("preview");
      setStatus("Restored your last build");
      return true;
    },
    [sessionKey],
  );

  // Restore on mount and whenever the library code changes, unless the
  // canvas already holds real work.
  React.useEffect(() => {
    const code = libraryCode.trim();
    if (restoredRef.current === code) return;
    restoredRef.current = code;
    const blank = html === EMPTY_DOC || html.length < 40;
    if (blank) restoreSession(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryCode, restoreSession]);

  // Autosave whatever is on the canvas.
  React.useEffect(() => {
    if (!html || html === EMPTY_DOC || html.length < 40) return;
    const t = window.setTimeout(() => {
      safeSet(sessionKey(libraryCode), {
        html,
        title,
        prompt,
        versions: versions.slice(0, 10),
        at: Date.now(),
      } satisfies PocketSession);
    }, 600);
    return () => window.clearTimeout(t);
  }, [html, title, prompt, versions, libraryCode, sessionKey]);


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

  // Full reset: wipes the canvas, history, prompt and the saved session for
  // the current code so the user can start a brand-new build.
  const clearAll = React.useCallback(() => {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Clear this build and start a new one? This cannot be undone.");
      if (!ok) return;
      try {
        window.localStorage.removeItem(sessionKey(libraryCode));
      } catch {
        /* ignore */
      }
    }
    // Stop any in-flight generation first — otherwise its stream keeps writing
    // HTML back into the sandbox right after we wipe it.
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    abortRef.current = null;
    setBusy(null);
    const next = projectFromHtml(EMPTY_DOC);
    setProject(next);
    setActiveFileId(next.entryFileId);
    setTitle("Untitled build");
    setPrompt("");
    setVersions([]);
    setShareUrl(null);
    setPublishedUrl(null);
    setDemoLive(null);
    setLogs([]);
    setError(null);
    setPane("preview");
    setStatus("Cleared — ready for a new build");
    setPreviewNonce((n) => n + 1);
    restoredRef.current = libraryCode.trim();
    promptRef.current?.focus();
  }, [libraryCode, sessionKey]);


  // ---- Real generation (streaming /api/generate) --------------------------
  const generate = React.useCallback(async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setError(null);
    setBusy("generating");
    setStatus("Generating…");
    setPane("preview");
    const controller = new AbortController();
    abortRef.current = controller;
    const previous = html;
    const t0 = performance.now();
    try {
      const res = await authFetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Paid accounts go through the metered path (Pocket = 10 builds/mo).
          ...(paidAccess ? {} : { "x-obs-free": "1" }),
        },
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
        if (isCreditsRequiredEnvelope(envelope)) throw new Error(envelope.message);
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
        // Repaint on a slower cadence and only at a safe tag boundary, so the
        // preview grows in cleanly instead of flashing half-parsed markup.
        if (now - lastPaint > 650) {
          const partial = clean(acc);
          const cut = partial.lastIndexOf(">");
          if (cut > 200) {
            lastPaint = now;
            setProject((prev) => setEntryHtml(prev, partial.slice(0, cut + 1)));
          }
        }
      }
      const finalHtml = clean(acc).trim();
      if (finalHtml.length < 40) throw new Error("The model returned an empty document.");
      setProject((prev) => setEntryHtml(prev, finalHtml));
      setVersions((v) => pushVersion(v, makeForgeVersion(finalHtml, titleFromPrompt(p))));
      if (title === "Untitled build") setTitle(titleFromPrompt(p));
      setStatus(`Built in ${Math.round(performance.now() - t0)}ms`);
      log(`Generated ${finalHtml.length.toLocaleString()} chars with ${model}`);
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
  }, [prompt, busy, html, mode, model, title, log]);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ---- Prompt enhancement (real server fn + credit gate) ------------------
  const runEnhanceMode = React.useCallback(
    async (mode: "rewrite" | "extend") => {
      const p = prompt.trim();
      if (!p || busy) return;
      setBusy("enhancing");
      setStatus(mode === "extend" ? "Reading your prompt and adding ideas…" : "Enhancing prompt…");
      try {
        const r = await enhance({
          data: { prompt: p, hasHtml: html.length > 200, surface: "pocket", mode },
        });
        if ("paywall" in r) {
          setStatus("Ready");
          return;
        }
        setPrompt(r.prompt);
        setStatus(mode === "extend" ? "Ideas added to your prompt" : "Prompt enhanced");
      } catch (err) {
        setError(sanitizeErrorMessage(err, "Could not enhance the prompt."));
      } finally {
        setBusy(null);
      }
    },
    [prompt, busy, enhance, html],
  );
  const runEnhance = React.useCallback(() => runEnhanceMode("rewrite"), [runEnhanceMode]);
  const runExtendIdeas = React.useCallback(() => runEnhanceMode("extend"), [runEnhanceMode]);


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
    if (!paidAccess) { requireAccount("Saving projects"); return; }

    setBusy("saving");
    setStatus("Saving…");
    setError(null);
    try {
      const res = await authFetch("/api/public/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-obs-free": "1" },
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
  }, [busy, html, title, prompt, model, libraryCode, loadLibrary, log, paidAccess, requireAccount]);

  // ---- Deploy (existing outbound QA gate → save → share URL) --------------
  const deploy = React.useCallback(async () => {
    if (busy || html.length < 40) return;
    // Open the tab synchronously (no `noopener`, otherwise the handle is null)
    // so browsers don't block the popup after the async publish round-trip.
    let win: Window | null = null;
    try {
      win = window.open("", "_blank");
      if (win) {
        win.opener = null;
        win.document.write(
          '<title>Publishing…</title><body style="background:#08090b;color:#F4A125;font-family:system-ui;display:grid;place-items:center;height:100vh">Publishing your build…</body>',
        );
      }
    } catch { win = null; }
    const closeWin = () => { try { win?.close(); } catch { /* ignore */ } };
    const assessment = assessOutbound(html, { surface: "go-live" });
    if (!assessment.ok) {
      closeWin();
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
        headers: { "Content-Type": "application/json", "x-obs-free": "1" },
        body: JSON.stringify({
          title,
          prompt,
          html: assessment.finalHtml,
          model,
          library_code: libraryCode.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        closeWin();
        throw new Error(text);
      }
      const j = (await res.json()) as { share_slug: string };
      const url = `${window.location.origin}/api/public/share/${j.share_slug}`;
      setShareUrl(url);
      setStatus("Live");
      log(`Published → ${url}`);
      // Always surface the URL in-app: popups are frequently blocked inside
      // embedded previews, which used to make publishing look like it failed.
      setPublishedUrl(url);
      if (win && !win.closed) {
        try { win.location.replace(url); } catch { /* keep in-app link */ }
      } else {
        try { window.open(url, "_blank", "noopener,noreferrer"); } catch { /* keep in-app link */ }
      }
    } catch (err) {
      closeWin();
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
        headers: { "Content-Type": "application/json", "x-obs-free": "1" },
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

  // ---- Share to the public Community Library (open to everyone) ----------
  const shareToLibrary = React.useCallback(async () => {
    if (busy || html.length < 40) return;

    // Toggle off — unshare a build that is already in the library.
    if (inCommunity) {
      setStatus("Removing from Library…");
      try {
        const res = await fetch("/api/public/community", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inCommunity.id, share_slug: inCommunity.slug, is_public: false }),
        });
        if (!res.ok) throw new Error(await res.text());
        setInCommunity(null);
        setStatus("Removed from Library");
        log("Removed build from the community library.");
      } catch (err) {
        setError(sanitizeErrorMessage(err, "Remove failed."));
      }
      return;
    }

    const assessment = assessOutbound(html, { surface: "featured-demo" });
    if (!assessment.ok) {
      setError(`Share blocked by QA gate: ${assessment.blockers.slice(0, 3).join(", ")}`);
      setStatus("Share blocked");
      return;
    }

    setBusy("deploying");
    setStatus("Sharing to Library…");
    setError(null);
    try {
      const code = libraryCode.trim();
      const res = await authFetch("/api/public/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-obs-free": "1" },
        body: JSON.stringify({
          title,
          prompt,
          html: assessment.finalHtml,
          model,
          library_code: code || undefined,
          is_public: true,
          surface: "pocket",
          author_label: code ? `Builder ${code.slice(-4)}` : "Anonymous builder",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { id: string; share_slug: string };
      const url = `${window.location.origin}/api/public/share/${j.share_slug}`;
      setInCommunity({ id: j.id, slug: j.share_slug });
      setShareUrl(url);
      setStatus("Shared to Library");
      log(`Shared to community library → ${url}`);
      void loadLibrary(libraryCode);
    } catch (err) {
      setError(sanitizeErrorMessage(err, "Share failed."));
      setStatus("Share failed");
    } finally {
      setBusy(null);
    }
  }, [busy, html, title, prompt, model, libraryCode, inCommunity, loadLibrary, log]);

  // ---- Remix: /pocket?remix=<community build id> --------------------------
  const remixLoadedRef = React.useRef(false);
  React.useEffect(() => {
    if (remixLoadedRef.current) return;
    const id = new URLSearchParams(window.location.search).get("remix");
    if (!id) return;
    remixLoadedRef.current = true;
    void (async () => {
      setStatus("Loading remix…");
      try {
        const res = await fetch(`/api/public/community/${encodeURIComponent(id)}?remix=1`);
        if (!res.ok) throw new Error(await res.text());
        const j = (await res.json()) as { title: string; prompt: string; html: string };
        setProject((prev) => setEntryHtml(prev, j.html));
        setTitle(`${j.title || "Remix"} (remix)`);
        setPrompt(j.prompt || "");
        setInCommunity(null);
        setStatus("Remix loaded — describe your changes");
        log(`Remixed community build ${id}`);
      } catch (err) {
        setError(sanitizeErrorMessage(err, "Could not load that remix."));
      }
    })();
  }, [log]);



  const exportProject = React.useCallback(async () => {
    if (!paidAccess) { requireAccount("Exporting code"); return; }
    const blob = new Blob([sanitizeForExport(html)], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "obsidian-forge"}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Exported");
  }, [html, title, isAdminCode, paidAccess, requireAccount]);

  const openGithub = React.useCallback(async () => {
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

  // Embedded mode (?embed=1) runs inside the login-page sandbox overlay — use
  // compact panel heights so the whole workspace fits without page scrolling.
  const [embed, setEmbed] = React.useState(false);
  React.useEffect(() => {
    setEmbed(new URLSearchParams(window.location.search).get("embed") === "1");
  }, []);
  const paneHeight = embed ? "h-[42vh]" : "h-[72vh]";

  return (
    <div className="relative min-h-screen bg-[#08090b] text-[#E8E6E1]">
      {/* Holographic hieroglyph wall + interactive dot-grid background */}
      <PocketBackground />


      <div className="relative z-10">
      {/* Sticky compact header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/40 backdrop-blur">
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
            <img
              src={pocketLogo.url}
              alt="Aetheris"
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[#F4A125]/40"
            />

            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight">Obsidian Pocket</h1>
              <p className="truncate text-[10px] uppercase tracking-widest text-[#6b7180]">
                Pocket workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 sm:flex">
              <span className="text-[10px] uppercase tracking-widest text-[#6b7180]">Code</span>
              <input
                value={libraryCode}
                onChange={(e) => setLibraryCode(e.target.value)}
                placeholder="e.g. 9822"
                aria-label="Account / library code"
                title="Enter your code to auto-save and load your projects"
                className="w-[86px] bg-transparent text-xs text-[#E8E6E1] placeholder:text-[#4b5060] focus-visible:outline-none"
              />
              <span
                className={`h-1.5 w-1.5 rounded-full ${libraryCode.trim() ? "bg-emerald-400" : "bg-[#4b5060]"}`}
                title={libraryCode.trim() ? "Signed in — projects auto-save" : "No code — projects are not saved"}
              />
            </label>

            {buildsLeft ? (
              <span
                className="hidden rounded-md border border-[#F4A125]/30 bg-[#F4A125]/10 px-2 py-1 text-[11px] text-[#F4A125] md:inline"
                title={`Pocket plan: ${buildsLeft.used} of ${buildsLeft.cap} builds used this month`}
              >
                {buildsLeft.remaining}/{buildsLeft.cap} builds left
              </span>
            ) : !paidAccess ? (
              <button
                type="button"
                className={btn}
                onClick={() => setPricingOpen(true)}
                title={`Obsidian Pocket — $10/month for ${POCKET_MONTHLY_BUILDS} builds, saving and export`}
              >
                Upgrade
              </button>
            ) : null}
            <button
              type="button"
              className={btn}
              onClick={() => navigate({ to: "/unlock" })}
              aria-label="Go back to Obsidian Vibe home"
              title="Home"
            >
              <Home size={14} />
              <span className="hidden sm:inline">Home</span>
            </button>
            <span
              aria-live="polite"
              className="hidden max-w-[220px] truncate text-xs text-[#B6BCC8] sm:inline"
            >
              {status}
            </span>
            <button
              type="button"
              className={btn}
              onClick={clearAll}
              aria-label="Clear all and start a new build"
            >
              Clear all
            </button>
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
            className="hidden w-60 shrink-0 border-r border-white/10 bg-black/30 p-3 backdrop-blur-md md:block"
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
            <div className="mb-3 rounded-lg border border-[#F4A125]/30 bg-[#F4A125]/10 px-3 py-2 text-xs text-[#E8E6E1] backdrop-blur-sm">
              Obsidian Pocket is completely free — unlimited builds, saving, export, and publishing. No card, no sign-in.
            </div>
          )}


          {/* Prompt composer */}

          <section className="rounded-xl border border-white/10 bg-black/30 p-3 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] backdrop-blur-md">
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
            {/* Idea categories */}
            {!prompt.trim() && (
              <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Idea categories">
                {POCKET_IDEA_CATEGORIES.map((c) => {
                  const active = ideaCategory === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={aiIdeasLoading && active}
                      onClick={() => {
                        setIdeaCategory(c.id);
                        setAiIdeas([]);
                        void loadCategoryIdeas(c.id);
                      }}
                      className={`rounded-full border px-2 py-[3px] text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 ${
                        active
                          ? "border-[#F4A125]/65 bg-[#F4A125]/15 text-[#F4A125]"
                          : "border-white/10 bg-white/[0.03] text-[#B6BCC8] hover:text-[#E8E6E1]"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Idea chips — click to append, then Enhance to expand */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {aiIdeasLoading && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#7d8494]">
                  <Loader2 size={12} className="animate-spin" /> Finding fresh ideas…
                </span>
              )}
              {ideaChips.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  title={a.reason || a.snippet}
                  onClick={() => {
                    setPrompt((p) => (p.trim() ? `${p.trim()} ${a.snippet}` : a.snippet));
                    requestAnimationFrame(() => promptRef.current?.focus());
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#B6BCC8] transition hover:border-[#F4A125]/50 hover:text-[#F4A125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
                >
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIdeaOffset((o) => o + 4);
                  if (!prompt.trim()) void loadCategoryIdeas(ideaCategory);
                }}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#7d8494] transition hover:text-[#E8E6E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
              >
                More ideas

              </button>
            </div>

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
                <button
                  type="button"
                  className={btn}
                  onClick={() => void runExtendIdeas()}
                  disabled={!!busy || !prompt.trim()}
                  title="Reads what you wrote and adds more ideas on top — your words are kept"
                >
                  <Sparkles size={13} /> Extend ideas
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
              <button
                type="button"
                className={`${btn} ${inCommunity ? "!border-emerald-400/50 !text-emerald-300" : ""}`}
                onClick={() => void shareToLibrary()}
                disabled={!!busy}
                title={inCommunity ? "In the community library — click to remove" : "Share this build to the public community library"}
              >
                <Library size={13} /> {inCommunity ? "In Library" : "Share to Library"}
              </button>
              {isAdminCode && (
                <button
                  type="button"
                  className={`${btn} ${demoLive ? "!border-emerald-400/50 !text-emerald-300" : "!border-rose-400/40 !text-rose-300"}`}
                  onClick={() => void pushToDemos()}
                  disabled={!!busy}
                  title={demoLive ? "Live on the Demos page — click to remove" : "Push this build to the public Demos page"}
                >
                  <Rocket size={13} /> {demoLive ? "On Demos" : "Push to Demos"}
                </button>
              )}
            </div>
          </div>

          {/* Build panel */}
          {tab === "build" && (
            <section
              id="forge-panel-build"
              role="tabpanel"
              aria-labelledby="forge-tab-build"
              className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]"
            >
              {/* Code side */}
              <div
                className={`${pane === "code" ? "block" : "hidden"} lg:block rounded-xl border border-white/10 bg-black/30 backdrop-blur-md`}
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
                      if (!paidAccess) { requireAccount("Copying code"); return; }
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
                  className={`${paneHeight} w-full resize-none rounded-b-xl bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-[#cfd3db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F4A125]/60`}
                />
              </div>

              {/* Preview side */}
              <div
                className={`${pane === "preview" ? "block" : "hidden"} lg:block rounded-xl border border-white/10 bg-black/30 backdrop-blur-md`}
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
                <div className={`relative flex ${paneHeight} justify-center overflow-hidden bg-[#050608] p-2`}>
                  <PocketPreviewFrame
                    key={`preview-${previewNonce}`}
                    title="Obsidian Pocket preview"
                    doc={srcDoc}
                    className="h-full w-full"
                    style={frameWidth ? { maxWidth: `${frameWidth}px` } : undefined}
                  />
                  {busy === "generating" ? <PocketBuildOrb label="Building your page…" /> : null}
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
              className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur-md"
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
              className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur-md"
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

      {/* Aetheris Instructor — plain-English teacher for the whole system. */}
      <AetherisInstructor
        currentHtml={html}
        controls={{
          getPrompt: () => promptRef.current?.value ?? prompt,
          setPrompt: (next) => {
            setPrompt(next);
            requestAnimationFrame(() => promptRef.current?.focus());
          },
          appendPrompt: (extra) => {
            setPrompt((p) => (p.trim() ? `${p.trim()} ${extra.trim()}` : extra.trim()));
            requestAnimationFrame(() => promptRef.current?.focus());
          },
          build: () => void generate(),
          extendIdeas: () => void runExtendIdeas(),
          clear: clearAll,
          busy: !!busy,
        }}
      />


      {/* Published build modal — always shows the live URL even if the
          browser blocked the new tab (common inside embedded previews). */}
      {publishedUrl && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Build published"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#F4A125]/30 bg-black/60 p-5 shadow-2xl backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-[#F4A125]">Your build is live</h2>
            <p className="mt-1 text-sm text-[#B6BCC8]">
              Open it in a new tab — your workspace stays exactly as it is.
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
              <iframe
                src={publishedUrl}
                title="Published build preview"
                className="h-56 w-full bg-white"
                sandbox="allow-scripts allow-forms allow-popups"
              />
            </div>
            <a
              className="mt-3 block break-all text-xs text-[#F4A125] underline underline-offset-2"
              href={publishedUrl}
              target="_blank"
              rel="noreferrer"
            >
              {publishedUrl}
            </a>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className="rounded-lg bg-[#F4A125] px-3 py-1.5 text-sm font-semibold text-black"
                href={publishedUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open build
              </a>
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#B6BCC8]"
                onClick={() => { void navigator.clipboard?.writeText(publishedUrl); setStatus("Link copied"); }}
              >
                Copy link
              </button>
              <button
                type="button"
                className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#B6BCC8]"
                onClick={() => setPublishedUrl(null)}
              >
                Back to workspace
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="h-full w-full max-w-sm overflow-y-auto border-l border-white/10 bg-black/40 p-4 backdrop-blur-xl">
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
              <button
                type="button"
                className={`${btn} col-span-2 ${inCommunity ? "!border-emerald-400/50 !text-emerald-300" : ""}`}
                onClick={() => void shareToLibrary()}
                disabled={!!busy}
              >
                <Library size={13} /> {inCommunity ? "In Library (click to remove)" : "Share to Library"}
              </button>
              {isAdminCode && (
                <button
                  type="button"
                  className={`${btn} col-span-2 ${demoLive ? "!border-emerald-400/50 !text-emerald-300" : "!border-rose-400/40 !text-rose-300"}`}
                  onClick={() => void pushToDemos()}
                  disabled={!!busy}
                >
                  <Rocket size={13} /> {demoLive ? "On Demos (click to remove)" : "Push to Demos"}
                </button>
              )}
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
