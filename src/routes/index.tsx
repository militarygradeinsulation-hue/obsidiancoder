import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  Send, Eye, Code2, Loader2, Home, FolderOpen, FileText, Files, Code,
  Layers, Bot, CheckSquare, Database, Sparkles, TerminalSquare,
  FlaskConical, GitBranch, Rocket, Settings, ChevronDown, Search,
  Menu, X, Plus, ChevronLeft, ChevronRight, MoreHorizontal, Monitor,
  Smartphone, Calendar, Check, ArrowRight, FileCode, Paperclip,
  Trash2, Square,
} from "lucide-react";
import aetherisLogo from "@/assets/aetheris-logo.png.asset.json";
import { MODEL_PICKER_OPTIONS, DEFAULT_MODEL, resolveModel, type ModelId } from "@/lib/models";
import { classifyTask } from "@/lib/task-classifier";
import { tryDeterministicEdit } from "@/lib/deterministic-edits";
import { validateHtml, blockingIssues } from "@/lib/validation";
import { metricsFromClassification, formatDuration, type GenerationMetrics } from "@/lib/generation-metrics";
import { extractOutline, outlineToPrompt } from "@/lib/document-outline";
import { EMPTY_MEMORY, memoryToPrompt, type ProjectMemory } from "@/lib/project-memory";
import { applyPatch, preflightPatch } from "@/lib/patch-engine";
import { patchSchema } from "@/lib/patch-protocol";
import { diffSummary } from "@/lib/diff-summary";
import { repairHtml } from "@/lib/repair";
import { safeGet, safeSet, sanitizeErrorMessage } from "@/lib/safe-storage";
import type { VersionMetadata, RepairAttempt } from "@/lib/version-metadata";
import { MemoryPanel } from "@/components/panels/MemoryPanel";
import { VersionHistoryPanel, type UiVersion } from "@/components/panels/VersionHistoryPanel";
import { DesignSystemPanel } from "@/components/panels/DesignSystemPanel";
import { createPipeline, type StageName, type StageState } from "@/lib/pipeline";
import { TrustDashboard } from "@/components/panels/TrustDashboard";
import { RulesPanel, reconcileRules } from "@/components/panels/RulesPanel";
import { RuntimePanel, countRuntimeBlockers } from "@/components/panels/RuntimePanel";
import { CostPanel } from "@/components/panels/CostPanel";
import { ExecutionGraphPanel } from "@/components/panels/ExecutionGraphPanel";
import { FileExplorerPanel } from "@/components/panels/FileExplorerPanel";
import { InspectorPanel, type InspectorSelection } from "@/components/panels/InspectorPanel";
import { FlowPanel } from "@/components/panels/FlowPanel";
import { ComponentLibraryPanel } from "@/components/panels/ComponentLibraryPanel";
import { DeploymentReadinessPanel } from "@/components/panels/DeploymentReadinessPanel";
import { GitReadyPanel } from "@/components/panels/GitReadyPanel";
import { TemplatePanel, type Template } from "@/components/panels/TemplatePanel";
import { injectRuntimeBridge, parseRuntimeMessage, type RuntimeEvent } from "@/lib/runtime-bridge";
import { EMPTY_COST, foldMetrics, recordRestore, type CostSnapshot } from "@/lib/cost-metrics";
import { evaluateCommit, type CommitSource } from "@/lib/commit-gate";
import { stripPreviewOnly } from "@/lib/clean-export";
import { migrateFromHtml, type Project } from "@/lib/project-model";
import { record as recordFeedback, type FeedbackEvent } from "@/lib/failure-learning";
import type { ComponentEntry } from "@/lib/component-library";
import { runRules, type Rule, type RuleViolation } from "@/lib/rules-engine";
import { buildGraph } from "@/lib/knowledge-graph";
import Background from "@/components/Background";



export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    await ensureUnlocked();
  },
  head: () => ({
    meta: [
      { title: "Obsidian — Vibe coding, elevated" },
      { name: "description", content: "A premium prompt-to-page workspace. Deep space palette, warm gold accents, live preview." },
      { property: "og:title", content: "Obsidian — Vibe coding, elevated" },
      { property: "og:description", content: "A premium prompt-to-page workspace. Deep space palette, warm gold accents, live preview." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

// Client-side model picker id: registry id, or "auto" (resolves to DEFAULT_MODEL server-side).
type PickerModelId = ModelId | "auto";

const MODES = [
  { id: "agent",  label: "Agent",  hint: "Autonomous — plans + builds in one pass." },
  { id: "chat",   label: "Chat",   hint: "Planning & iteration, no code changes." },
  { id: "plan",   label: "Plan",   hint: "Architecture-first outline before build." },
  { id: "dev",    label: "Dev",    hint: "Direct code edits, minimal narration." },
  { id: "visual", label: "Visual", hint: "Layout, spacing, color — micro tweaks." },
] as const;
type ModeId = (typeof MODES)[number]["id"];

const MODE_PREFIX: Record<ModeId, string> = {
  agent:  "",
  chat:   "PLANNING MODE. Do not modify the current build's structure. Reply with a concise strategic plan rendered as a clean HTML page (headings + checklist). Ask no questions.",
  plan:   "PLAN MODE. Output an architecture outline (sections, components, data, integrations) as a rendered checklist page. Do not implement features yet.",
  dev:    "DEV MODE. Apply the smallest possible diff to the current HTML to satisfy the request. Preserve everything else byte-for-byte.",
  visual: "VISUAL EDIT MODE. Only adjust layout, spacing, color, typography, and micro-interactions. Do not change copy, structure, or logic.",
};

const INTEGRATIONS = [
  { id: "supabase", label: "Supabase",   sub: "Auth · Postgres · RLS", on: true  },
  { id: "stripe",   label: "Stripe",     sub: "Payments & subs",       on: false },
  { id: "resend",   label: "Resend",     sub: "Transactional email",   on: false },
  { id: "meta",     label: "Meta Graph", sub: "Instagram · FB",        on: false },
  { id: "apify",    label: "Apify",      sub: "Web scraping",          on: false },
  { id: "n8n",      label: "n8n",        sub: "Workflow webhooks",     on: false },
] as const;


type Version = {
  id: string;
  ts: number;
  html: string;
  label: string;
  protected?: boolean;
  metadata?: VersionMetadata;
};

type Session = {
  id: string;
  title: string;
  messages: ChatMsg[];
  html: string;
  model: PickerModelId;
  mode: ModeId;
  versions: Version[];
  memory: ProjectMemory;
  // Core 3.0 F3 additions — safe defaults on hydrate.
  rules?: Rule[];
  runtimeEvents?: RuntimeEvent[];
  cost?: CostSnapshot;
  // Core 3.1 additions — lazy-migrated on load; all optional.
  project?: Project;
  activeFileId?: string;
  feedback?: FeedbackEvent[];
  components?: ComponentEntry[];
  templates?: Template[];
  lastRequest?: string;
};

const WORKSPACE_NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "files", label: "Files", icon: Files },
  { id: "code", label: "Code", icon: Code },
  { id: "snippets", label: "Snippets", icon: Layers },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "databases", label: "Databases", icon: Database },
] as const;

const TOOLS_NAV: { id: string; label: string; icon: typeof Sparkles; shortcut?: string }[] = [
  { id: "ai-chat", label: "AI Chat", icon: Sparkles, shortcut: "⌘ I" },
  { id: "code-assist", label: "Code Assist", icon: Code2, shortcut: "⌘ L" },
  { id: "terminal", label: "Terminal", icon: TerminalSquare, shortcut: "⌘ J" },
  { id: "playground", label: "Playground", icon: FlaskConical },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "settings", label: "Settings", icon: Settings, shortcut: "⌘ K" },
];

const RAIL_GROUPS = [
  { id: "agent", label: "Agent" },
  { id: "build", label: "Build" },
  { id: "ship",  label: "Ship"  },
] as const;
type RailGroupId = (typeof RAIL_GROUPS)[number]["id"] | "all";

const SUGGESTIONS = [
  { icon: Calendar, label: "Add a hero with a call-to-action" },
  { icon: Layers, label: "Build a pricing section" },
  { icon: FileCode, label: "Generate a landing page" },
] as const;

const STORAGE_KEY = "obsidian.vibe.sessions.v1";
const ACTIVE_KEY = "obsidian.vibe.active.v1";

function newSession(): Session {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    title: "Untitled",
    messages: [{ role: "assistant", content: "Obsidian is ready. Tell me what to build." }],
    html: "",
    model: "auto",
    mode: "agent",
    versions: [],
    memory: { ...EMPTY_MEMORY },
    rules: reconcileRules(undefined),
    runtimeEvents: [],
    cost: { ...EMPTY_COST },
  };
}

const INITIAL_SESSION = newSession();

function Index() {
  // streaming via /api/generate
  const [sessions, setSessions] = useState<Session[]>([INITIAL_SESSION]);
  const [activeId, setActiveId] = useState<string>(INITIAL_SESSION.id);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>("projects");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("obs.sidebarCollapsed") === "1";
  });
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("obs.railCollapsed") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("obs.sidebarCollapsed", sidebarCollapsed ? "1" : "0"); } catch {}
  }, [sidebarCollapsed]);
  useEffect(() => {
    try { window.localStorage.setItem("obs.railCollapsed", railCollapsed ? "1" : "0"); } catch {}
  }, [railCollapsed]);
  const [terminal, setTerminal] = useState<string[]>([
    "· Sandbox ready — no build yet",
  ]);
  const [lastMetrics, setLastMetrics] = useState<GenerationMetrics | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [stage, setStage] = useState<StageName | null>(null);
  const [stageDetail, setStageDetail] = useState<string>("");
  const [railGroup, setRailGroup] = useState<RailGroupId>("all");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const [inspectorEnabled, setInspectorEnabled] = useState(false);
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function stopGeneration() {
    abortRef.current?.abort();
  }

  const current = sessions.find((s) => s.id === activeId) ?? sessions[0];

  useEffect(() => {
    const parsed = safeGet<Session[]>(STORAGE_KEY);
    const activeRaw = safeGet<string>(ACTIVE_KEY);
    if (Array.isArray(parsed) && parsed.length) {
      const normalized: Session[] = parsed.map((s) => {
        const partial = s as Partial<Session>;
        return {
          ...s,
          mode: partial.mode ?? "agent",
          versions: Array.isArray(s.versions) ? s.versions : [],
          memory: { ...EMPTY_MEMORY, ...(partial.memory ?? {}) },
          rules: reconcileRules(partial.rules),
          runtimeEvents: [], // never persist runtime log — always fresh per session load
          cost: { ...EMPTY_COST, ...(partial.cost ?? {}) },
          // Lazy-migrate legacy sessions — only touch when field is missing.
          project: partial.project ?? (s.html ? migrateFromHtml(s.html) : undefined),
          feedback: Array.isArray(partial.feedback) ? partial.feedback : [],
          components: Array.isArray(partial.components) ? partial.components : [],
          templates: Array.isArray(partial.templates) ? partial.templates : [],
        };
      });
      setSessions(normalized);
      const id = activeRaw && parsed.find((s) => s.id === activeRaw) ? activeRaw : parsed[0].id;
      setActiveId(id);
    }
    setHydrated(true);
  }, []);

  // Debounced persistence — quota failures surface once via terminal, non-destructive.
  useEffect(() => {
    if (!hydrated) return;
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      const ok = safeSet(STORAGE_KEY, sessions);
      if (!ok) setTerminal((t) => (t[t.length - 1]?.includes("Storage quota") ? t : [...t, "! Storage quota exceeded — session not persisted"]));
    }, 250);
    return () => { if (writeTimerRef.current) clearTimeout(writeTimerRef.current); };
  }, [sessions, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    safeSet(ACTIVE_KEY, activeId);
    // Cancel any stale in-flight request when the active session changes.
    abortRef.current?.abort();
  }, [activeId, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [current.messages, loading, activeId, input]);

  const previewSrcDoc = useMemo(
    () =>
      injectRuntimeBridge(current.html ||
        `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0a0a0a;color:#666;font-family:Inter,system-ui;font-size:13px;letter-spacing:.02em">Nothing built yet.</body></html>`),
    [current.html],
  );

  // Runtime bridge — listen for sanitized preview events, bounded to 100 per session.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function onMsg(evt: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || evt.source !== iframe.contentWindow) return;
      const parsed = parseRuntimeMessage(evt, iframe.contentWindow);
      if (!parsed) return;
      setSessions((all) => all.map((s) => s.id === activeId
        ? { ...s, runtimeEvents: [...(s.runtimeEvents ?? []).slice(-99), parsed] }
        : s));
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [activeId]);

  // Clear runtime log whenever the previewed HTML changes (new run = fresh log).
  useEffect(() => {
    setSessions((all) => all.map((s) => s.id === activeId ? { ...s, runtimeEvents: [] } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.html]);

  // Fold new lastMetrics into per-session cost snapshot exactly once.
  const foldedMetricsRef = useRef<GenerationMetrics | null>(null);
  useEffect(() => {
    if (!lastMetrics || lastMetrics === foldedMetricsRef.current) return;
    foldedMetricsRef.current = lastMetrics;
    setSessions((all) => all.map((s) => s.id === activeId
      ? { ...s, cost: foldMetrics(s.cost ?? EMPTY_COST, lastMetrics) }
      : s));
  }, [lastMetrics, activeId]);

  function updateCurrent(patch: Partial<Session>) {
    setSessions((all) => all.map((s) => (s.id === activeId ? { ...s, ...patch } : s)));
  }

  function scrollRailTo(anchorId: string) {
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function handleNav(id: string) {
    setActiveNav(id);
    setSidebarOpen(false);
    switch (id) {
      case "home":       setTab("preview"); break;
      case "projects":   setPaletteOpen(true); setPaletteQuery("Jump to tab:"); break;
      case "notes":      setRailGroup("agent"); scrollRailTo("rail-memory"); break;
      case "files":      setRailGroup("build"); scrollRailTo("rail-files"); break;
      case "code":       setTab("code"); break;
      case "snippets":   setRailGroup("build"); scrollRailTo("rail-components"); break;
      case "agents":     setRailGroup("agent"); scrollRailTo("rail-agent"); break;
      case "tasks":      setRailGroup("build"); scrollRailTo("rail-flow"); break;
      case "databases":  break; // disabled; no connector
      case "ai-chat":    setRailGroup("agent"); scrollRailTo("rail-agent"); requestAnimationFrame(() => composerRef.current?.focus()); break;
      case "code-assist": setTab("code"); updateCurrent({ mode: "dev" }); break;
      case "terminal":   setRailGroup("agent"); scrollRailTo("rail-terminal"); break;
      case "playground": setTab("preview"); break;
      case "git":        setRailGroup("ship"); scrollRailTo("rail-git"); break;
      case "deploy":     setRailGroup("ship"); scrollRailTo("rail-deploy"); break;
      case "settings":   setPaletteOpen(true); break;
    }
  }

  function addSession() {
    const s = newSession();
    setSessions((all) => [...all, s]);
    setActiveId(s.id);
    setInput("");
    setError(null);
    setTab("preview");
  }

  function closeSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions((all) => {
      const next = all.filter((s) => s.id !== id);
      if (next.length === 0) {
        const s = newSession();
        setActiveId(s.id);
        return [s];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function clearAll() {
    if (loading) return;
    const ok = window.confirm(
      "Clear this tab? This wipes the chat, the current preview, and all saved versions for this session. This can't be undone.",
    );
    if (!ok) return;
    const fresh = newSession();
    setSessions((all) => all.map((s) => (s.id === activeId ? { ...fresh, id: s.id, model: s.model } : s)));
    setInput("");
    setPendingAttachments([]);
    setError(null);
    setTab("preview");
    setTerminal((t) => [...t, "✓ Cleared session"]);
  }

  function revertTo(version: Version) {
    if (loading) return;
    setSessions((all) => all.map((s) => s.id === activeId
      ? {
          ...s,
          html: version.html,
          messages: [...s.messages, { role: "assistant", content: `↶ Reverted to "${version.label}"` }],
        }
      : s));
    setTab("preview");
    setError(null);
    setTerminal((t) => [...t, `→ Reverted to "${version.label}"`]);
  }

  type Attachment =
    | { kind: "image"; name: string; dataUrl: string }
    | { kind: "text"; name: string; text: string; source: "text" | "pdf" };
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function extractPdfText(file: File): Promise<string> {
    const pdfjs: any = await import("pdfjs-dist");
    const worker: any = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const out: string[] = [];
    const max = Math.min(doc.numPages, 25);
    for (let i = 1; i <= max; i++) {
      const page = await doc.getPage(i);
      const c = await page.getTextContent();
      out.push(c.items.map((it: any) => it.str).join(" "));
    }
    return out.join("\n\n").slice(0, 60000);
  }

  async function handleFilesPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    for (const file of files) {
      try {
        if (file.size > 8 * 1024 * 1024) {
          setError(`"${file.name}" is too large (max 8 MB).`);
          continue;
        }
        if (file.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("read failed"));
            r.readAsDataURL(file);
          });
          setPendingAttachments((a) => [...a, { kind: "image", name: file.name, dataUrl }]);
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const text = await extractPdfText(file);
          setPendingAttachments((a) => [...a, { kind: "text", name: file.name, text, source: "pdf" }]);
        } else {
          const text = await file.text();
          setPendingAttachments((a) => [
            ...a,
            { kind: "text", name: file.name, text: text.slice(0, 60000), source: "text" },
          ]);
        }
      } catch (err) {
        setError(`Could not read "${file.name}": ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }

  function removeAttachment(idx: number) {
    setPendingAttachments((a) => a.filter((_, i) => i !== idx));
  }

  // Deterministic bounded repair — one pass. Returns repaired html + attempt record.
  function tryLocalRepair(html: string, issues: ReturnType<typeof validateHtml>["issues"]): { html: string; attempt: RepairAttempt; passed: boolean } {
    const r = repairHtml(html, issues);
    const v = validateHtml(r.html);
    return {
      html: r.html,
      passed: v.status !== "failed",
      attempt: { kind: "deterministic", fixes: r.fixes, usedCredits: false },
    };
  }

  // Central commit gate — runs rules (already-validated candidate) and
  // returns null if the candidate is clear to commit, or the list of
  // blocking reasons if the caller must keep the stable HTML.
  function checkCommitGate(prev: string, candidate: string, source: CommitSource): string[] | null {
    const report = evaluateCommit({
      previousHtml: prev,
      candidateHtml: candidate,
      source,
      rules: current.rules ?? [],
      allowRepair: false, // callers already ran repair; gate is rule-only here
    });
    if (report.ok) return null;
    return report.blockers;
  }

  function pushFeedback(sessionId: string, evt: Omit<FeedbackEvent, "ts">) {
    setSessions((all) => all.map((s) => s.id === sessionId
      ? { ...s, feedback: recordFeedback(s.feedback ?? [], { ...evt, ts: Date.now() }) }
      : s));
  }


  function buildMetadata(input: {
    request: string;
    classification: ReturnType<typeof classifyTask>;
    strategy: VersionMetadata["strategy"];
    model: string;
    durationMs: number;
    contextTier?: VersionMetadata["contextTier"];
    contextChars?: number;
    patchOperations?: number;
    charsAdded: number;
    charsRemoved: number;
    changed: boolean;
    validation: ReturnType<typeof validateHtml>;
    repairAttempts?: RepairAttempt[];
  }): VersionMetadata {
    const bIssues = blockingIssues(input.validation);
    const warnings = input.validation.issues.filter((i) => i.severity === "warning").length;
    const info = input.validation.issues.filter((i) => i.severity === "info").length;
    return {
      id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
      createdAt: Date.now(),
      request: input.request,
      taskType: input.classification.taskType,
      strategy: input.strategy,
      model: input.model,
      tier: "balanced",
      durationMs: Math.round(input.durationMs),
      contextTier: input.contextTier ?? "none",
      contextChars: input.contextChars ?? 0,
      patchOperations: input.patchOperations,
      charsAdded: input.charsAdded,
      charsRemoved: input.charsRemoved,
      changed: input.changed,
      validation: {
        status: input.validation.status,
        summary: input.validation.summary,
        blocking: bIssues.length,
        warnings,
        info,
      },
      repairAttempts: input.repairAttempts ?? [],
    };
  }

  function makeVersion(html: string, label: string, meta: VersionMetadata): Version {
    return {
      id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
      ts: Date.now(),
      html,
      label,
      metadata: meta,
    };
  }

  async function submit(promptOverride?: string) {
    const basePrompt = (promptOverride ?? input).trim();
    if ((!basePrompt && pendingAttachments.length === 0) || loading) return;
    const activeMode = current.mode;
    // Chat and Plan modes must NEVER overwrite the live preview — they are advisory.
    const previewMode = activeMode !== "chat" && activeMode !== "plan";
    // Stable snapshot: never let a failed edit corrupt the last good HTML.
    const stableHtml = current.html;

    // 1. Classify.
    const classification = classifyTask(basePrompt, { mode: activeMode, hasHtml: !!stableHtml });
    const t0 = performance.now();

    setError(null);
    setInput("");
    setPendingAttachments([]);
    const nextHistory: ChatMsg[] = [...current.messages, { role: "user", content: basePrompt || "(attachment only)" }];
    const isFirstUserMsg = !current.messages.some((m) => m.role === "user");
    updateCurrent({
      messages: nextHistory,
      title: isFirstUserMsg ? (basePrompt || pendingAttachments[0]?.name || "Untitled").slice(0, 28) : current.title,
    });
    setLoading(true);
    setStage("classify");
    setStageDetail(classification.taskType);
    setTerminal((t) => [...t, `→ [${classification.taskType}] via ${classification.executionPath}`]);
    const sessionId = activeId;

    // 2. Deterministic fast-path (Agent/Dev/Visual, when classifier says so, and no attachments).
    if (
      previewMode &&
      classification.executionPath === "deterministic" &&
      pendingAttachments.length === 0 &&
      stableHtml
    ) {
      const det = tryDeterministicEdit(basePrompt, stableHtml);
      if (det.ok) {
        const validation = validateHtml(det.html);
        if (validation.status === "failed") {
          setTerminal((t) => [...t, `✗ Validation failed — reverted, falling back to AI.`]);
          // fall through to AI path (do NOT overwrite stableHtml)
        } else {
          const versionLabel = basePrompt.slice(0, 48) || "Deterministic edit";
          const detDiff = diffSummary(stableHtml, det.html);
          const detMeta = buildMetadata({
            request: basePrompt,
            classification,
            strategy: "deterministic",
            model: "deterministic",
            durationMs: performance.now() - t0,
            patchOperations: 1,
            charsAdded: detDiff.charsAdded,
            charsRemoved: detDiff.charsRemoved,
            changed: true,
            validation,
          });
          const gateBlockers = checkCommitGate(stableHtml, det.html, "deterministic");
          if (gateBlockers) {
            setSessions((all) => all.map((s) => s.id === sessionId
              ? { ...s, messages: [...s.messages, { role: "assistant", content: `⚠ Blocked by rule: ${gateBlockers.join("; ").slice(0, 200)} — preview unchanged.` }] }
              : s));
            setTerminal((t) => [...t, `✗ Rule gate rejected deterministic edit: ${gateBlockers[0].slice(0, 120)}`]);
            pushFeedback(sessionId, { taskType: classification.taskType, strategy: "deterministic", model: null, validationStatus: validation.status, runtimeErrors: 0, outcome: "rejected", reason: gateBlockers[0] });
            setLoading(false); setStage(null);
            return;
          }
          const newVersion: Version = makeVersion(det.html, versionLabel, detMeta);
          setSessions((all) => all.map((s) => s.id === sessionId
            ? {
                ...s,
                html: det.html,
                messages: [...s.messages, { role: "assistant", content: `✓ ${det.summary}  _(No AI credits used.)_` }],
                versions: [newVersion, ...(s.versions ?? [])].slice(0, 25),
              }
            : s));

          const durationMs = performance.now() - t0;
          setTerminal((t) => [...t, `✓ Deterministic edit in ${Math.round(durationMs)}ms`, `✓ Validation: ${validation.status}`]);
          setLastMetrics(metricsFromClassification(classification, {
            usedAi: false,
            model: null,
            durationMs,
            summary: det.summary,
            validation,
            documentChanged: true,
            strategy: "deterministic",
            patchOperationCount: 1,
            patchOperationTypes: ["deterministic-edit"],
            patchOperationSummaries: [det.summary],
            charactersAdded: detDiff.charsAdded,
            charactersRemoved: detDiff.charsRemoved,
            fallbackUsed: false,
          }));
          setLoading(false); setStage(null);
          return;
        }
      } else {
        setTerminal((t) => [...t, `· Deterministic pass declined: ${det.reason.slice(0, 90)} — routing to AI.`]);
      }
    }

    // 2b. AI-patch path — targeted edit against an existing document.
    patchAttempt: if (
      previewMode &&
      classification.strategy === "ai-patch" &&
      stableHtml &&
      pendingAttachments.length === 0
    ) {

      const modelForPatch = resolveModel(current.model);
      const outline = outlineToPrompt(extractOutline(stableHtml));
      const memoryStr = memoryToPrompt(current.memory);
      const patchController = new AbortController();
      abortRef.current = patchController;
      try {
        setTerminal((t) => [...t, `→ Patch mode → ${modelForPatch}`]);
        const pRes = await fetch("/api/patch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: patchController.signal,
          body: JSON.stringify({
            prompt: basePrompt,
            currentHtml: stableHtml,
            outline,
            memory: memoryStr,
            model: modelForPatch,
          }),
        });
        if (!pRes.ok) {
          const t = await pRes.text().catch(() => "");
          throw new Error(t || `Patch request failed (${pRes.status})`);
        }
        const pJson = await pRes.json() as
          | { ok: true; patch: unknown; model: string; fallbackUsed: boolean }
          | { ok: false; error: string; fallbackUsed: boolean; model: string };

        if (!pJson.ok) {
          setTerminal((t) => [...t, `✗ Patch invalid: ${pJson.error.slice(0, 120)} — falling back to full AI generation.`]);
          abortRef.current = null;
          break patchAttempt;
        } else {

          const patchParsed = patchSchema.safeParse(pJson.patch);
          if (!patchParsed.success) {
            setTerminal((t) => [...t, `✗ Patch schema rejected — falling back to full AI generation.`]);
            abortRef.current = null;
            break patchAttempt;
          } else if (patchParsed.data.operations.length === 0) {

            // Legitimate escape hatch: model explicitly deferred to full generation.
            setTerminal((t) => [...t, `· Model deferred to full generation (empty patch).`]);

          } else {
            const applied = applyPatch(stableHtml, patchParsed.data);
            if (!applied.ok) {
              setTerminal((t) => [...t, `✗ Patch apply failed (${applied.error.slice(0, 100)}) — falling back to full AI generation.`]);
              abortRef.current = null;
              break patchAttempt;
            }

            let validation = validateHtml(applied.html);
            let patchedHtml = applied.html;
            const patchRepairAttempts: RepairAttempt[] = [];
            if (validation.status === "failed") {
              const rep = tryLocalRepair(patchedHtml, validation.issues);
              patchRepairAttempts.push(rep.attempt);
              if (rep.passed) {
                patchedHtml = rep.html;
                validation = validateHtml(patchedHtml);
                setTerminal((t) => [...t, `↺ Deterministic repair (${rep.attempt.fixes.length} fix${rep.attempt.fixes.length === 1 ? "" : "es"}) — commit continued.`]);
              } else {
                setTerminal((t) => [...t, `✗ Patch validation failed (repair inconclusive) — falling back to full AI generation.`]);
                abortRef.current = null;
                break patchAttempt;
              }

            }

            // COMMIT — success
            const versionLabel = (patchParsed.data.summary || basePrompt).slice(0, 48);
            const durationMsCommit = performance.now() - t0;
            const commitMeta = buildMetadata({
              request: basePrompt,
              classification,
              strategy: "ai-patch",
              model: pJson.model,
              durationMs: durationMsCommit,
              patchOperations: applied.applied.length,
              charsAdded: applied.charsAdded,
              charsRemoved: applied.charsRemoved,
              changed: true,
              validation,
              repairAttempts: patchRepairAttempts,
            });
            const gateBlockersP = checkCommitGate(stableHtml, patchedHtml, "ai-patch");
            if (gateBlockersP) {
              setTerminal((t) => [...t, `✗ Rule gate rejected patch: ${gateBlockersP[0].slice(0, 100)} — falling back to full AI generation.`]);
              pushFeedback(sessionId, { taskType: classification.taskType, strategy: "ai-patch", model: pJson.model, validationStatus: validation.status, runtimeErrors: 0, outcome: "rejected", reason: gateBlockersP[0] });
              abortRef.current = null;
              break patchAttempt;
            }

            const newVersion: Version = makeVersion(patchedHtml, versionLabel, commitMeta);
            setSessions((all) => all.map((s) => s.id === sessionId
              ? {
                  ...s,
                  html: patchedHtml,
                  messages: [...s.messages, { role: "assistant", content: `✓ ${patchParsed.data.summary}  _(patch · ${applied.applied.length} op${applied.applied.length === 1 ? "" : "s"}${patchRepairAttempts.length ? " · repaired" : ""})_` }],
                  versions: [newVersion, ...(s.versions ?? [])].slice(0, 25),
                }
              : s));

            const durationMs = performance.now() - t0;
            setTerminal((t) => [
              ...t,
              `✓ Patched in ${Math.round(durationMs)}ms (${applied.applied.length} ops, +${applied.charsAdded}/-${applied.charsRemoved})`,
              `✓ Validation: ${validation.status}`,
            ]);
            setLastMetrics(metricsFromClassification(classification, {
              usedAi: true,
              model: pJson.model,
              durationMs,
              summary: patchParsed.data.summary,
              validation,
              documentChanged: true,
              strategy: "ai-patch",
              patchOperationCount: applied.applied.length,
              patchOperationTypes: applied.applied.map(a => a.op),
              patchOperationSummaries: applied.applied.map(a => a.summary),
              charactersAdded: applied.charsAdded,
              charactersRemoved: applied.charsRemoved,
              fallbackUsed: pJson.fallbackUsed,
            }));
            setLoading(false); setStage(null);
            abortRef.current = null;
            return;
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          setSessions((all) => all.map((s) => s.id === sessionId
            ? { ...s, messages: [...s.messages, { role: "assistant", content: "■ Stopped — preview unchanged." }] }
            : s));
          setTerminal((t) => [...t, "■ Patch stopped by user"]);
          setLoading(false); setStage(null);
          abortRef.current = null;
          return;
        }
        setTerminal((t) => [...t, `✗ Patch route error: ${(err as Error).message.slice(0, 120)} — falling back to full AI generation.`]);
        abortRef.current = null;
        break patchAttempt;


      } finally {
        abortRef.current = null;
      }
    }

    // 3. Full-generation AI path (streaming).
    const modePrefix = MODE_PREFIX[activeMode] ? `[${activeMode.toUpperCase()} MODE] ${MODE_PREFIX[activeMode]}\n\n` : "";
    let prompt = modePrefix + (basePrompt || (pendingAttachments.length ? "Use the attached materials as the source of truth for style, content, and design." : ""));
    for (const att of pendingAttachments) {
      if (att.kind === "image") {
        prompt += `\n\n[Attached image — embed exactly, do not replace]\nfilename: ${att.name}\nsrc: ${att.dataUrl}`;
      } else {
        const label = att.source === "pdf" ? "PDF style guide (extracted text)" : "Style guide / reference document";
        prompt += `\n\n[Attached ${label} — treat as authoritative brand/style/content reference]\nfilename: ${att.name}\n---\n${att.text}\n---`;
      }
    }
    const modelForServer = resolveModel(current.model);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentHtml: previewMode ? stableHtml : "",
          history: current.messages.slice(-4),
          model: modelForServer,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "AI request failed");
        throw new Error(text || `AI request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let firstChunkAt = 0;
      let lastPaint = 0;
      const paintPreview = (force = false) => {
        if (!previewMode) return;
        const now = performance.now();
        if (!force && now - lastPaint < 120) return;
        lastPaint = now;
        const cleaned = acc.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
        setSessions((all) => all.map((s) => s.id === sessionId ? { ...s, html: cleaned } : s));
      };
      if (previewMode) setTab("preview");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!firstChunkAt) {
          firstChunkAt = performance.now();
          setTerminal((t) => [...t, `→ First token in ${Math.round(firstChunkAt - t0)}ms`]);
        }
        paintPreview();
      }

      if (!previewMode) {
        const reply = acc.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim() || "(no response)";
        setSessions((all) => all.map((s) => s.id === sessionId
          ? { ...s, messages: [...s.messages, { role: "assistant", content: reply }] }
          : s));
        const durationMs = performance.now() - t0;
        setTerminal((t) => [...t, `✓ ${activeMode === "chat" ? "Chat" : "Plan"} response ready`]);
        setLastMetrics(metricsFromClassification(classification, {
          usedAi: true,
          model: modelForServer,
          durationMs,
          summary: `Advisory ${activeMode} reply`,
          validation: { status: "passed", summary: "All checks passed.", issues: [] },
          documentChanged: false,
          strategy: "advisory",
        }));
        return;
      }

      let finalHtml = acc.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!/<!doctype|<html/i.test(finalHtml)) {
        finalHtml = `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0f0d0a;color:#f6e6c8;font-family:system-ui;padding:24px}</style></head><body>${finalHtml}</body></html>`;
      }

      // 4. Validate AI output. Failed => try bounded deterministic repair; else revert.
      let validation = validateHtml(finalHtml);
      const fullRepairAttempts: RepairAttempt[] = [];
      if (validation.status === "failed") {
        const rep = tryLocalRepair(finalHtml, validation.issues);
        fullRepairAttempts.push(rep.attempt);
        if (rep.passed) {
          finalHtml = rep.html;
          validation = validateHtml(finalHtml);
          setTerminal((t) => [...t, `↺ Deterministic repair (${rep.attempt.fixes.length} fix${rep.attempt.fixes.length === 1 ? "" : "es"}) — commit continued.`]);
        } else {
          setSessions((all) => all.map((s) => s.id === sessionId
            ? { ...s, html: stableHtml, messages: [...s.messages, { role: "assistant", content: `⚠ Generated document failed validation and could not be auto-repaired: ${validation.issues.map(i => i.message).join(" ")} — reverted to last stable version.` }] }
            : s));
          const durationMs = performance.now() - t0;
          setTerminal((t) => [...t, `✗ Validation failed (repair inconclusive) — reverted.`]);
          setLastMetrics(metricsFromClassification(classification, {
            usedAi: true,
            model: modelForServer,
            durationMs,
            summary: "AI output rejected by validator; reverted to stable version.",
            validation,
            documentChanged: false,
            strategy: "full-generation",
          }));
          return;
        }
      }

      const versionLabel = (basePrompt || pendingAttachments[0]?.name || "Update").slice(0, 48);
      const durationMsGen = performance.now() - t0;
      const fullDiff = diffSummary(stableHtml, finalHtml);
      const genMeta = buildMetadata({
        request: basePrompt,
        classification,
        strategy: "full-generation",
        model: modelForServer,
        durationMs: durationMsGen,
        charsAdded: fullDiff.charsAdded,
        charsRemoved: fullDiff.charsRemoved,
        changed: true,
        validation,
        repairAttempts: fullRepairAttempts,
      });
      const gateBlockersG = checkCommitGate(stableHtml, finalHtml, "full-generation");
      if (gateBlockersG) {
        setSessions((all) => all.map((s) => s.id === sessionId
          ? { ...s, html: stableHtml, messages: [...s.messages, { role: "assistant", content: `⚠ Blocked by rule: ${gateBlockersG.join("; ").slice(0, 200)} — reverted to last stable version.` }] }
          : s));
        setTerminal((t) => [...t, `✗ Rule gate rejected generation: ${gateBlockersG[0].slice(0, 120)}`]);
        pushFeedback(sessionId, { taskType: classification.taskType, strategy: "full-generation", model: modelForServer, validationStatus: validation.status, runtimeErrors: 0, outcome: "rejected", reason: gateBlockersG[0] });
        return;
      }
      const newVersion: Version = makeVersion(finalHtml, versionLabel, genMeta);
      setSessions((all) => all.map((s) => s.id === sessionId
        ? {
            ...s,
            html: finalHtml,
            messages: [...s.messages, { role: "assistant", content: fullRepairAttempts.length ? "Done — updated the preview (auto-repaired minor issues)." : "Done — updated the preview." }],
            versions: [newVersion, ...(s.versions ?? [])].slice(0, 25),
          }
        : s));

      setTerminal((t) => [...t, `✓ Compiled in ${Math.round(durationMsGen)}ms`, `✓ Validation: ${validation.status}`]);
      setLastMetrics(metricsFromClassification(classification, {
        usedAi: true,
        model: modelForServer,
        durationMs: durationMsGen,
        summary: versionLabel,
        validation,
        documentChanged: true,
        strategy: "full-generation",
        patchOperationCount: 1,
        patchOperationTypes: ["full-generation"],
        patchOperationSummaries: [`Rewrote document (${finalHtml.length} chars)`],
        charactersAdded: fullDiff.charsAdded,
        charactersRemoved: fullDiff.charsRemoved,
      }));
      // Auto-save to gallery (admin-gated read).
      try {
        let clientId = localStorage.getItem("obs.client_id");
        if (!clientId) {
          clientId = (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
          localStorage.setItem("obs.client_id", clientId);
        }
        fetch("/api/public/builds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: versionLabel,
            prompt: basePrompt,
            html: finalHtml,
            model: modelForServer,
            session_id: sessionId,
            client_id: clientId,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.id && setTerminal((t) => [...t, `✓ Saved (${String(d.id).slice(0, 8)})`]))
          .catch(() => {});
      } catch {}
    } catch (err) {
      // Never overwrite the stable snapshot on error.
      setSessions((all) => all.map((s) => s.id === sessionId ? { ...s, html: stableHtml } : s));
      if ((err as { name?: string })?.name === "AbortError") {
        setSessions((all) => all.map((s) => s.id === sessionId
          ? { ...s, messages: [...s.messages, { role: "assistant", content: "■ Stopped — reverted to last stable version." }] }
          : s));
        setTerminal((t) => [...t, "■ Stopped by user"]);
      } else {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        setSessions((all) => all.map((s) => s.id === sessionId
          ? { ...s, messages: [...s.messages, { role: "assistant", content: `⚠ ${msg}` }] }
          : s));
        setTerminal((t) => [...t, `✗ ${msg}`]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false); setStage(null);
      setStage(null);
      setStageDetail("");
    }
  }



  const kb = current.html ? (current.html.length / 1024).toFixed(1) : "0.0";
  const userTurns = current.messages.filter((m) => m.role === "user").length;
  const versionCount = current.versions?.length ?? 0;
  const specTax = versionCount > 0 ? Math.max(0, Math.round(((userTurns - versionCount) / Math.max(1, userTurns)) * 100)) : 0;

  return (
    <main className={"obs-shell" + (sidebarCollapsed ? " is-sidebar-collapsed" : "") + (railCollapsed ? " is-rail-collapsed" : "")}>

      {sidebarOpen && <div className="obs-scrim" onClick={() => setSidebarOpen(false)} />}

      {/* ========== SIDEBAR ========== */}
      <aside className={"obs-sidebar " + (sidebarOpen ? "is-open" : "")}>
        <div className="obs-brand">
          <img src={aetherisLogo.url} alt="Aetheris" className="obs-mark obs-mark-img" />
          <span className="obs-brand-word">OBSIDIAN</span>
          <button type="button" className="obs-icon-btn obs-sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <button type="button" className="obs-search" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
          <Search className="h-3.5 w-3.5 obs-search-icon" strokeWidth={1.6} />
          <span className="obs-search-input" style={{ background: "transparent", border: 0, textAlign: "left", color: "inherit" }}>Search anything…</span>
          <kbd className="obs-kbd">⌘ K</kbd>
        </button>

        <div className="obs-section-label">Workspace</div>
        <nav className="obs-nav" aria-label="Workspace">
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const isDisabled = item.id === "databases";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                disabled={isDisabled}
                title={isDisabled ? "No database connector linked to this workspace" : item.label}
                aria-disabled={isDisabled || undefined}
                data-testid={`nav-${item.id}`}
                className={"obs-nav-item " + (isActive ? "is-active " : "") + (isDisabled ? "is-disabled" : "")}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="obs-section-label">Tools</div>
        <nav className="obs-nav" aria-label="Tools">
          {TOOLS_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                data-testid={`nav-${item.id}`}
                title={item.label}
                className={"obs-nav-item " + (isActive ? "is-active" : "")}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                <span>{item.label}</span>
                {item.shortcut && <kbd className="obs-kbd obs-kbd-nav">{item.shortcut}</kbd>}
              </button>
            );
          })}
        </nav>

        <div className="obs-sidebar-footer">
          <div className="obs-user">
            <div className="obs-avatar">A</div>
            <div className="obs-user-meta">
              <div className="obs-user-name">Obsidian Dev</div>
              <div className="obs-user-sub">Pro Workspace</div>
            </div>
            <button
              type="button"
              className="obs-icon-btn"
              aria-label="Open command palette (settings)"
              title="Command palette"
              data-testid="footer-settings"
              onClick={() => setPaletteOpen(true)}
            >
              <Settings className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>


      {/* ========== MAIN ========== */}
      <section className="obs-main">
        {/* Topbar */}
        <div className="obs-topbar">
          <div className="obs-topbar-left">
            <button
              type="button"
              className="obs-icon-btn"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
                  setSidebarOpen(true);
                } else {
                  setSidebarCollapsed((v) => !v);
                }
              }}
            >
              <Menu className="h-4 w-4" />
            </button>
            <img src={aetherisLogo.url} alt="Aetheris" className="obs-mark obs-mark-img obs-topbar-logo" />
            <button
              type="button"
              className="obs-icon-btn obs-rail-toggle-btn"
              aria-label={railCollapsed ? "Show right panel" : "Hide right panel"}
              title={railCollapsed ? "Show right panel" : "Hide right panel"}
              onClick={() => setRailCollapsed((v) => !v)}
            >
              {railCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="obs-tabs">
              {sessions.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveId(s.id);
                      setError(null);
                      setInput("");
                      setTab("preview");
                    }}
                    className={"obs-tab " + (isActive ? "is-active" : "")}
                    title={s.title}
                  >
                    <FileCode className="h-3.5 w-3.5" strokeWidth={1.6} />
                    <span className="obs-tab-title">{s.title}</span>
                    {isActive && s.html && <span className="obs-tab-live">LIVE</span>}
                    {sessions.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="obs-tab-close"
                        aria-label="Close tab"
                        onClick={(e) => closeSession(s.id, e)}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
              <button type="button" onClick={addSession} className="obs-icon-btn" aria-label="New tab">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="obs-topbar-right">
            <button
              type="button"
              className={"obs-chip " + (tab === "preview" ? "is-on" : "")}
              onClick={() => setTab("preview")}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              type="button"
              className={"obs-chip " + (tab === "code" ? "is-on" : "")}
              onClick={() => setTab("code")}
            >
              <Code2 className="h-3.5 w-3.5" /> Code
            </button>
            <div className="obs-divider" />
            <button
              type="button"
              className={"obs-icon-btn " + (device === "desktop" ? "is-on" : "")}
              onClick={() => setDevice("desktop")}
              aria-label="Desktop preview"
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={"obs-icon-btn " + (device === "mobile" ? "is-on" : "")}
              onClick={() => setDevice("mobile")}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-4 w-4" />
            </button>
            <div className="obs-divider" />
            <button
              type="button"
              className="obs-chip obs-chip-gold"
              disabled={!current.html}
              onClick={() => {
                if (!current.html) return;
                const blob = new Blob([current.html], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank", "noopener,noreferrer");
                setTerminal((t) => [...t, `→ Live: opened "${current.title}" in new tab`]);
              }}
              title={current.html ? "Open the current build as a standalone site" : "Build something first"}
            >
              <Rocket className="h-3.5 w-3.5" /> Go Live
            </button>
            <a
              href="/gallery"
              target="_blank"
              rel="noreferrer"
              className="obs-chip"
              title="See every build saved from every browser"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Gallery
            </a>
            <div className="obs-overflow-wrap">
              <button
                type="button"
                className="obs-icon-btn"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={overflowOpen}
                data-testid="topbar-overflow"
                onClick={() => setOverflowOpen((v) => !v)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {overflowOpen && (
                <div className="obs-overflow-menu" role="menu" onMouseLeave={() => setOverflowOpen(false)}>
                  <button
                    type="button"
                    role="menuitem"
                    className="obs-overflow-item"
                    disabled={!current.html}
                    onClick={() => {
                      setOverflowOpen(false);
                      if (!current.html) return;
                      const clean = stripPreviewOnly(current.html);
                      const blob = new Blob([clean], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `${(current.title || "obsidian").replace(/\s+/g, "-")}.html`; a.click();
                      URL.revokeObjectURL(url);
                      setTerminal((t) => [...t, `→ Exported clean HTML (${(clean.length / 1024).toFixed(1)} KB)`]);
                    }}
                  >Export clean HTML</button>
                  <button
                    type="button"
                    role="menuitem"
                    className="obs-overflow-item"
                    onClick={() => { setOverflowOpen(false); setPaletteOpen(true); }}
                  >Command palette (⌘ K)</button>
                  <button
                    type="button"
                    role="menuitem"
                    className="obs-overflow-item"
                    disabled={loading}
                    onClick={() => { setOverflowOpen(false); clearAll(); }}
                  >Clear this session</button>
                  <button
                    type="button"
                    role="menuitem"
                    className="obs-overflow-item"
                    onClick={() => { setOverflowOpen(false); handleNav("git"); }}
                  >Show Git-ready panel</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body: canvas + right rail */}
        <div className="obs-body">
          <div className="obs-canvas">
            <div className="obs-canvas-head">
              <div className="obs-page-title">
                <span className="obs-title-mark" />
                <h1>{current.title === "Untitled" ? "Vibe Coder" : current.title}</h1>
              </div>
              <div className="obs-mode-group" role="tablist" aria-label="Development mode">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={current.mode === m.id}
                    className={"obs-mode " + (current.mode === m.id ? "is-on" : "")}
                    onClick={() => updateCurrent({ mode: m.id })}
                    title={m.hint}
                    disabled={loading}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="obs-page-meta">
                <select
                  value={current.model}
                  onChange={(e) => updateCurrent({ model: e.target.value as PickerModelId })}
                  disabled={loading}
                  className="obs-model"
                  aria-label="Model"
                >
                  {MODEL_PICKER_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="obs-chip"
                  onClick={clearAll}
                  disabled={loading}
                  title="Clear this session — wipes chat, preview, and version history"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All
                </button>
                <div className="obs-avatar obs-avatar-sm">JT</div>
              </div>
            </div>

            <div className={"obs-preview-wrap " + (device === "mobile" ? "is-mobile" : "")}>
              {/* Amber constellation backdrop (behind preview) */}
              <Background />
              {/* Ambient matrix rain */}
              <div className="obs-matrix" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span
                    key={i}
                    className="matrix-line"
                    style={{
                      left: `${(i * 7.3) % 100}%`,
                      animationDelay: `${(i * 1.7) % 12}s`,
                      animationDuration: `${14 + (i % 5) * 3}s`,
                      opacity: 0.3 + ((i * 13) % 40) / 200,
                    }}
                  />
                ))}
              </div>
              {tab === "preview" ? (
                current.html ? (
                  <iframe
                    ref={iframeRef}
                    title="Obsidian preview"
                    srcDoc={previewSrcDoc}
                    sandbox="allow-scripts"
                    className="obs-preview"
                  />
                ) : (
                  <div className="obs-preview-empty">
                    <p>Ask Obsidian to build something.</p>
                    <span>Your sandbox preview will appear here.</span>
                  </div>
                )
              ) : (
                <pre className="obs-code">{current.html || "// Nothing yet."}</pre>
              )}
              {loading && (
                <div className="obs-preview-loading" aria-live="polite">
                  <div className="obs-loading-core">
                    <div className="obs-loading-orb" />
                    <div className="obs-loading-ring" />
                    <div className="obs-loading-ring is-outer" />
                  </div>
                  <div className="obs-loading-waves" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className="obs-loading-wave" style={{ animationDelay: `${i * 0.18}s` }} />
                    ))}
                  </div>
                  <p className="obs-loading-text">Weaving your build…</p>
                </div>
              )}
            </div>
            {error && <p className="obs-error">{error}</p>}
          </div>

          {/* ========== RIGHT RAIL ========== */}
          <aside className="obs-rail">
            <div className="obs-rail-tabs" role="tablist" aria-label="Rail sections">
              {RAIL_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={railGroup === g.id}
                  className={"obs-rail-tab " + (railGroup === g.id ? "is-on" : "")}
                  onClick={() => { setRailGroup(g.id); scrollRailTo(`rail-${g.id}`); }}
                  data-testid={`rail-tab-${g.id}`}
                >{g.label}</button>
              ))}
            </div>

            <div className="obs-rail-heading" id="rail-agent">Agent · chat, context, trust</div>
            {/* AI Agent */}
            <div className="obs-card">


              <div className="obs-card-head">
                <span className="obs-card-label">AI Agent</span>
                <span className="obs-status">
                  <span className="obs-status-dot" /> Active
                </span>
              </div>
              <div ref={scrollRef} className="obs-chat">
                {current.messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "obs-msg is-user" : "obs-msg is-assistant"}>
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div className="obs-msg is-assistant is-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Building…
                  </div>
                )}
              </div>
              <div className="obs-suggestions-label">Suggestions</div>
              <div className="obs-suggestions">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className="obs-suggestion"
                      onClick={() => submit(s.label)}
                      disabled={loading}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              {pendingAttachments.length > 0 && (
                <div className="obs-attach-list">
                  {pendingAttachments.map((att, i) => (
                    <div key={i} className="obs-attach-chip" title={att.name}>
                      {att.kind === "image" ? (
                        <img src={att.dataUrl} alt={att.name} />
                      ) : (
                        <span className="obs-attach-badge">{att.source === "pdf" ? "PDF" : "TXT"}</span>
                      )}
                      <span className="obs-attach-name">{att.name}</span>
                      <button type="button" className="obs-icon-btn" aria-label="Remove attachment" onClick={() => removeAttachment(i)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form
                className="obs-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf,.md,.markdown,.txt,.json,.css,.html,.htm,text/*"
                  multiple
                  className="obs-file-hidden"
                  onChange={handleFilesPick}
                />
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label="Attach style guide, image, or PDF"
                  title="Attach style guide, image, or PDF"
                  disabled={loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={composerRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={pendingAttachments.length ? "Describe how to use the attached materials…" : "Ask Obsidian AI…"}
                  disabled={loading}
                  className="obs-composer-input"
                  data-testid="composer-input"
                />

                {loading ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    aria-label="Stop"
                    className="obs-composer-send"
                    title="Stop"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() && pendingAttachments.length === 0}
                    aria-label="Send"
                    className="obs-composer-send"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
              {stage && (
                <div className="mt-2 text-[10px] uppercase tracking-wider opacity-70 flex items-center gap-2" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Stage: <b>{stage}</b>{stageDetail ? ` · ${stageDetail}` : ""}</span>
                </div>
              )}

            </div>


            {/* Context */}
            <div className="obs-card">
              <div className="obs-card-head">
                <span className="obs-card-label">Context</span>
                <button
                  type="button"
                  className="obs-add-tiny"
                  aria-label="Attach a file to context"
                  title="Attach a file to context"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="h-3 w-3" />
                </button>

              </div>
              <ul className="obs-file-list">
                {sessions.slice(0, 6).map((s) => (
                  <li key={s.id} className="obs-file">
                    <span className="obs-file-badge">TSX</span>
                    <span className="obs-file-name">{(s.title || "Untitled").replace(/\s+/g, "_")}.tsx</span>
                  </li>
                ))}
                <li className="obs-file">
                  <span className="obs-file-badge is-css">CSS</span>
                  <span className="obs-file-name">obsidian.css</span>
                </li>
              </ul>
              <button
                type="button"
                className="obs-add-context"
                onClick={() => fileInputRef.current?.click()}
                data-testid="context-add"
              >
                <Paperclip className="h-3.5 w-3.5" /> Add Context
              </button>
            </div>

            <div className="obs-rail-heading" id="rail-build">Build · files, versions, design</div>

            {/* Version History V2 */}
            <VersionHistoryPanel

              versions={current.versions as UiVersion[]}
              currentHtml={current.html}
              disabled={loading}
              onRevert={(v) => revertTo(v as Version)}
              onRename={(id, label) =>
                updateCurrent({
                  versions: current.versions.map((v) => (v.id === id ? { ...v, label } : v)),
                })
              }
              onToggleProtect={(id) =>
                updateCurrent({
                  versions: current.versions.map((v) => (v.id === id ? { ...v, protected: !v.protected } : v)),
                })
              }
              onDelete={(id) =>
                updateCurrent({ versions: current.versions.filter((v) => v.id !== id) })
              }
            />

            {/* Memory V2 */}
            <MemoryPanel
              memory={current.memory}
              html={current.html}
              onChange={(m) => updateCurrent({ memory: m })}
            />

            {/* Design System */}
            <DesignSystemPanel
              html={current.html}
              disabled={loading || !current.html}
              onApply={(result) => {
                const next = result.html;
                const meta = buildMetadata({
                  request: result.label,
                  classification: classifyTask("update design tokens", { mode: current.mode, hasHtml: true }),
                  strategy: "deterministic",
                  model: "deterministic",
                  durationMs: 0,
                  charsAdded: Math.max(0, next.length - current.html.length),
                  charsRemoved: Math.max(0, current.html.length - next.length),
                  changed: next !== current.html,
                  validation: validateHtml(next),
                });
                const v = makeVersion(next, result.label, meta);
                updateCurrent({
                  html: next,
                  versions: [v, ...current.versions].slice(0, 25),
                  messages: [...current.messages, { role: "assistant", content: `✓ ${result.label} (${result.changes} change${result.changes === 1 ? "" : "s"}, no AI credits).` }],
                });
                setTerminal((t) => [...t, `✓ ${result.label}`]);
              }}
            />


            <div className="obs-rail-heading" id="rail-ship">Ship · integrations, cost, deploy</div>

            {/* Integrations */}
            <div className="obs-card" id="rail-integrations">

              <div className="obs-card-head">
                <span className="obs-card-label">Integrations</span>
                <span className="obs-node">{INTEGRATIONS.filter((i) => i.on).length}/{INTEGRATIONS.length}</span>
              </div>
              <ul className="obs-integ-list">
                {INTEGRATIONS.map((it) => (
                  <li key={it.id} className={"obs-integ " + (it.on ? "is-on" : "")}>
                    <span className="obs-integ-dot" />
                    <div className="obs-integ-meta">
                      <span className="obs-integ-name">{it.label}</span>
                      <span className="obs-integ-sub">{it.sub}</span>
                    </div>
                    <span className="obs-integ-state">{it.on ? "Linked" : "Add"}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Last operation metrics */}
            {lastMetrics && (
              <div className="obs-card">
                <div className="obs-card-head">
                  <span className="obs-card-label">Last operation</span>
                  <span className={
                    "obs-node " +
                    (lastMetrics.validation.status === "passed" ? "text-emerald-400"
                      : lastMetrics.validation.status === "warnings" ? "text-amber-300"
                      : "text-red-400")
                  }>{lastMetrics.validation.status}</span>
                </div>
                <div className="obs-metrics">
                  <div className="obs-metric-row"><span>Task</span><b>{lastMetrics.taskType}</b></div>
                  <div className="obs-metric-row"><span>Path</span><b>{lastMetrics.executionPath}</b></div>
                  <div className="obs-metric-row">
                    <span>AI used</span>
                    <b>{lastMetrics.usedAi ? "Yes" : "No — no AI credits used"}</b>
                  </div>
                  {lastMetrics.usedAi && lastMetrics.model && (
                    <div className="obs-metric-row"><span>Model</span><b>{lastMetrics.model}</b></div>
                  )}
                  <div className="obs-metric-row"><span>Strategy</span><b>{lastMetrics.strategy ?? "—"}</b></div>
                  <div className="obs-metric-row"><span>Cost</span><b>{lastMetrics.costEstimate}</b></div>
                  <div className="obs-metric-row"><span>Duration</span><b>{formatDuration(lastMetrics.durationMs)}</b></div>
                  <div className="obs-metric-row"><span>Changed</span><b>{lastMetrics.documentChanged ? "Yes" : "No"}</b></div>
                  {typeof lastMetrics.patchOperationCount === "number" && (
                    <div className="obs-metric-row"><span>Operations</span><b>{lastMetrics.patchOperationCount}</b></div>
                  )}
                  {(typeof lastMetrics.charactersAdded === "number" || typeof lastMetrics.charactersRemoved === "number") && (
                    <div className="obs-metric-row"><span>Chars ±</span><b>+{lastMetrics.charactersAdded ?? 0} / −{lastMetrics.charactersRemoved ?? 0}</b></div>
                  )}
                  {lastMetrics.fallbackUsed && (
                    <div className="obs-metric-row"><span>Fallback</span><b className="text-amber-300">used</b></div>
                  )}
                  <div className="obs-metric-note">{lastMetrics.summary}</div>
                  {lastMetrics.patchOperationSummaries && lastMetrics.patchOperationSummaries.length > 0 && (
                    <ul className="obs-metric-issues">
                      {lastMetrics.patchOperationSummaries.slice(0, 6).map((s, idx) => (
                        <li key={idx} className="opacity-80">• {s}</li>
                      ))}
                    </ul>
                  )}
                  {lastMetrics.validation.issues.length > 0 && (
                    <ul className="obs-metric-issues">
                      {lastMetrics.validation.issues.slice(0, 4).map((i, idx) => (
                        <li key={idx} className={i.level === "fail" ? "text-red-400" : "text-amber-300"}>
                          {i.level === "fail" ? "✗" : "!"} {i.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Trust Dashboard — Obsidian Core 3.0 evidence-based confidence */}
            <TrustDashboard html={current.html} runtimeErrors={countRuntimeBlockers(current.runtimeEvents ?? [])} />
            <ExecutionGraphPanel currentStage={stage} stageDetail={stageDetail} loading={loading} lastMetrics={lastMetrics} />
            <RuntimePanel
              events={current.runtimeEvents ?? []}
              onClear={() => updateCurrent({ runtimeEvents: [] })}
            />
            <RulesPanel
              html={current.html}
              rules={current.rules ?? reconcileRules(undefined)}
              onRulesChange={(rules) => updateCurrent({ rules })}
            />
            <CostPanel snapshot={current.cost ?? EMPTY_COST} />

            {/* Core 3.1 — file explorer, inspector, flow runner, components, deployment, git-ready, templates */}
            <div id="rail-files"><FileExplorerPanel
              project={current.project}
              activeFileId={current.activeFileId}
              onSelect={(id) => updateCurrent({ activeFileId: id })}
            /></div>
            <InspectorPanel
              selection={inspectorSelection}
              enabled={inspectorEnabled}
              onToggle={setInspectorEnabled}
            />
            <div id="rail-flow"><FlowPanel /></div>
            <div id="rail-components"><ComponentLibraryPanel
              components={current.components ?? []}
              onDelete={(id) => updateCurrent({ components: (current.components ?? []).filter((c) => c.id !== id) })}
              onDuplicate={(id) => {
                const c = (current.components ?? []).find((x) => x.id === id);
                if (!c) return;
                const dup: ComponentEntry = { ...c, id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())), name: `${c.name} copy`, createdAt: Date.now() };
                updateCurrent({ components: [...(current.components ?? []), dup] });
              }}
            /></div>
            {(() => {
              const violations: RuleViolation[] = current.html
                ? runRules(current.rules ?? [], current.html, buildGraph(current.html))
                : [];
              const blockingRuleCount = violations.filter((v) => v.severity === "blocking").length;
              return (
                <div id="rail-deploy"><DeploymentReadinessPanel
                  html={current.html}
                  validationStatus={current.versions[0]?.metadata?.validation.status ?? "unknown"}
                  blockingRuleCount={blockingRuleCount}
                  runtimeErrorCount={countRuntimeBlockers(current.runtimeEvents ?? [])}
                /></div>
              );
            })()}
            <div id="rail-git"><GitReadyPanel
              previousHtml={current.versions[0]?.html ?? ""}
              currentHtml={current.html}
              lastRequest={current.lastRequest}
            /></div>

            <TemplatePanel
              html={current.html}
              templates={current.templates ?? []}
              onSave={(t) => updateCurrent({ templates: [...(current.templates ?? []), t] })}
              onDelete={(id) => updateCurrent({ templates: (current.templates ?? []).filter((t) => t.id !== id) })}
              onClone={(t) => {
                const s: Session = { ...newSession(), title: t.name.slice(0, 40), html: t.html };
                setSessions((all) => [s, ...all]);
                setActiveId(s.id);
              }}
            />


            {/* Project Memory */}
            <div className="obs-card" id="rail-memory">

              <div className="obs-card-head">
                <span className="obs-card-label">Project memory</span>
                <span className="obs-node opacity-60">context for AI</span>
              </div>
              <div className="obs-metrics" style={{ gap: 6 }}>
                {([
                  ["purpose", "Purpose"],
                  ["audience", "Audience"],
                  ["design", "Design direction"],
                  ["constraints", "Constraints"],
                  ["doNotChange", "Do NOT change"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="obs-metric-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                    <span className="opacity-70 text-[10px] uppercase tracking-wider">{label}</span>
                    <textarea
                      value={current.memory[key]}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, 500);
                        setSessions((all) => all.map((s) => s.id === activeId
                          ? { ...s, memory: { ...s.memory, [key]: val } }
                          : s));
                      }}
                      rows={2}
                      className="obs-memory-input"
                      placeholder={`(none)`}
                    />
                  </label>
                ))}
              </div>
            </div>



            {/* Terminal */}
            <div className="obs-card" id="rail-terminal">

              <div className="obs-card-head">
                <span className="obs-card-label">Terminal</span>
                <span className="obs-node">node <ChevronDown className="h-3 w-3 inline" /></span>
              </div>
              <div className="obs-terminal">
                {terminal.slice(-6).map((line, i) => {
                  const ok = line.startsWith("✓");
                  const arr = line.startsWith("→");
                  const bad = line.startsWith("✗");
                  return (
                    <div
                      key={i}
                      className={
                        "obs-term-line " +
                        (ok ? "is-ok " : "") + (arr ? "is-arrow " : "") + (bad ? "is-bad " : "")
                      }
                    >
                      {ok && <Check className="h-3 w-3" strokeWidth={2.5} />}
                      <span>{line.replace(/^[✓→✗]\s?/, "")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom status bar */}
        <div className="obs-status-bar" role="status">
          <div className="obs-status-left">
            <span className="obs-badge-gold">Sandbox</span>
            <span data-testid="status-state">
              {loading ? (stage || "Working…") : error ? "Error" : current.html ? "Ready" : "Idle"}
            </span>
            <span className="obs-muted">{current.mode.toUpperCase()} · {current.model.split("/").pop()}</span>
          </div>
          <div className="obs-status-right">
            <span className="obs-muted">{current.versions.length} version{current.versions.length === 1 ? "" : "s"}</span>
            {current.html ? (
              <span className="obs-ok"><Check className="h-3 w-3 inline" /> Build attached</span>
            ) : (
              <span className="obs-muted">No build yet</span>
            )}
            <span className="obs-muted" title="Rework ratio: user turns per saved version (specification tax)">Spec-tax {specTax}%</span>
            <span className="obs-muted">{kb} KB</span>
          </div>
        </div>

      </section>

      {paletteOpen && (
        <div className="obs-palette-scrim" onClick={() => setPaletteOpen(false)}>
          <div className="obs-palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <div className="obs-palette-head">
              <Search className="h-4 w-4" strokeWidth={1.6} />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Run a command, jump to a tab, or ask AI…"
                className="obs-palette-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && paletteQuery.trim()) {
                    const q = paletteQuery.trim();
                    setPaletteOpen(false);
                    setPaletteQuery("");
                    submit(q);
                  }
                }}
              />
              <kbd className="obs-kbd">ESC</kbd>
            </div>
            <div className="obs-palette-list">
              {[
                { label: "New tab", run: () => { setPaletteOpen(false); addSession(); } },
                { label: "Clear this session", run: () => { setPaletteOpen(false); clearAll(); } },
                { label: "Toggle Preview / Code", run: () => { setPaletteOpen(false); setTab(tab === "preview" ? "code" : "preview"); } },
                { label: "Desktop view", run: () => { setPaletteOpen(false); setDevice("desktop"); } },
                { label: "Mobile view", run: () => { setPaletteOpen(false); setDevice("mobile"); } },
                { label: "Go Live (open current build)", run: () => {
                  setPaletteOpen(false);
                  if (!current.html) return;
                  const blob = new Blob([current.html], { type: "text/html" });
                  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
                } },
                ...MODES.map((m) => ({
                  label: `Mode: ${m.label} — ${m.hint}`,
                  run: () => { setPaletteOpen(false); updateCurrent({ mode: m.id }); },
                })),
                ...sessions.map((s) => ({
                  label: `Jump to tab: ${s.title}`,
                  run: () => { setPaletteOpen(false); setActiveId(s.id); },
                })),
              ]
                .filter((c) => !paletteQuery || c.label.toLowerCase().includes(paletteQuery.toLowerCase()))
                .slice(0, 12)
                .map((c) => (
                  <button key={c.label} type="button" className="obs-palette-item" onClick={c.run}>
                    <span>{c.label}</span>
                    <ArrowRight className="h-3 w-3 opacity-60" />
                  </button>
                ))}
              {paletteQuery.trim() && (
                <button
                  type="button"
                  className="obs-palette-item obs-palette-run"
                  onClick={() => {
                    const q = paletteQuery.trim();
                    setPaletteOpen(false);
                    setPaletteQuery("");
                    submit(q);
                  }}
                >
                  <span>Send to Obsidian AI: “{paletteQuery.trim().slice(0, 60)}”</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
