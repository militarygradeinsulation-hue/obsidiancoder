import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Send, Eye, Code2, Loader2, Home, FolderOpen, FileText, Files, Code,
  Layers, Bot, CheckSquare, Database, Sparkles, TerminalSquare,
  FlaskConical, GitBranch, Rocket, Settings, ChevronDown, Search,
  Menu, X, Plus, ChevronLeft, ChevronRight, MoreHorizontal, Monitor,
  Smartphone, Calendar, Check, ArrowRight, FileCode, Paperclip,
  Trash2, Square, Wand2, GripVertical, Pin, Github, CreditCard, User as UserIcon,
  Camera, Scissors, RefreshCw, GitMerge, Bookmark, BookmarkCheck, LogOut,
} from "lucide-react";
import { ScreenCaptureModal } from "@/components/ScreenCapture";
import { BuildChatPanel } from "@/components/BuildChatPanel";
import { MessageSquare, ZoomIn, ZoomOut, Maximize2, ClipboardList } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { enhancePrompt as enhancePromptFn } from "@/lib/enhance.functions";
import { suggestAddons, STARTER_IDEA_COUNT, type Addon } from "@/lib/prompt-enhance";
import { generateStarterIdeas, anticipateNextIdeas } from "@/lib/ideas.functions";
import { pushFeaturedDemo, deleteFeaturedDemo } from "@/lib/featured-demos.functions";

type DemoCat = "App" | "Landing" | "Dashboard" | "Tool" | "Game" | "Portfolio";
function classifyDemoCategory(...parts: (string | undefined | null)[]): DemoCat {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => t.includes(k));
  if (has("game", "arcade", "puzzle", "quiz", "trivia", "rpg", "platformer", "shooter", "chess", "tetris", "snake", "maze")) return "Game";
  if (has("dashboard", "analytics", "admin panel", "metrics", "kpi", "chart", "monitor", "report", "stats", "crm")) return "Dashboard";
  if (has("portfolio", "resume", "cv ", "about me", "personal site", "photographer", "designer showcase")) return "Portfolio";
  if (has("landing", "marketing", "hero section", "pricing page", "waitlist", "coming soon", "product page")) return "Landing";
  if (has("tool", "calculator", "converter", "generator", "utility", "editor", "notepad", "timer", "tracker", "planner")) return "Tool";
  return "App";
}
import aetherisLogo from "@/assets/aetheris-logo.png.asset.json";
import { MODEL_PICKER_OPTIONS, DEFAULT_MODEL, resolveModel, type ModelId, type ModeId as ModelModeId } from "@/lib/models";
import { GithubModal } from "@/components/GithubModal";
import { PricingModal } from "@/components/PricingModal";
import { AccountModal } from "@/components/AccountModal";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { useAuth, useSubscription } from "@/hooks/useSubscription";
import { useEntitlement, refreshEntitlement } from "@/hooks/useEntitlement";
import { requirePaidAction } from "@/lib/action-guard";
import { authFetch } from "@/lib/auth-fetch";
import { isCreditsRequiredEnvelope } from "@/lib/credit-gate";
import { lockSite } from "@/lib/gate.functions";
import { supabase } from "@/integrations/supabase/client";

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
import { safeGet, safeSet, sessionSafeGet, sessionSafeSet, sanitizeErrorMessage } from "@/lib/safe-storage";
import { isAiErrorEnvelope, type AiErrorEnvelope } from "@/lib/ai-errors";
import type { VersionMetadata, RepairAttempt } from "@/lib/version-metadata";
import { MemoryPanel } from "@/components/panels/MemoryPanel";
import { VersionHistoryPanel, type UiVersion } from "@/components/panels/VersionHistoryPanel";
import { DesignSystemPanel } from "@/components/panels/DesignSystemPanel";
import { createPipeline, type StageName, type StageState } from "@/lib/pipeline";
import { TrustDashboard } from "@/components/panels/TrustDashboard";
import { RulesPanel, reconcileRules } from "@/components/panels/RulesPanel";
import IntroSplash from "@/components/IntroSplash";
import { RuntimePanel, countRuntimeBlockers } from "@/components/panels/RuntimePanel";
import { CostPanel } from "@/components/panels/CostPanel";
import { CreditBar } from "@/components/panels/CreditBar";
import { ExecutionGraphPanel } from "@/components/panels/ExecutionGraphPanel";
import { FileExplorerPanel } from "@/components/panels/FileExplorerPanel";
import { InspectorPanel, type InspectorSelection } from "@/components/panels/InspectorPanel";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { LearningPanel } from "@/components/panels/LearningPanel";
import { StrategyExplanation } from "@/components/panels/StrategyExplanation";
import { FlowPanel } from "@/components/panels/FlowPanel";
import { ComponentLibraryPanel } from "@/components/panels/ComponentLibraryPanel";
import { DeploymentReadinessPanel } from "@/components/panels/DeploymentReadinessPanel";
import { GitReadyPanel } from "@/components/panels/GitReadyPanel";
import { TemplatePanel, type Template } from "@/components/panels/TemplatePanel";
import { injectRuntimeBridge, parseRuntimeMessage, type RuntimeEvent } from "@/lib/runtime-bridge";
import { EMPTY_COST, foldMetrics, recordRestore, type CostSnapshot } from "@/lib/cost-metrics";
import { evaluateCommit, type CommitSource } from "@/lib/commit-gate";
import { sanitizeForExport } from "@/lib/clean-export";
import { FusionModal, type FusionCommit } from "@/components/FusionModal";
import { migrateFromHtml, type Project } from "@/lib/project-model";
import { record as recordFeedback, type FeedbackEvent } from "@/lib/failure-learning";
import type { ComponentEntry } from "@/lib/component-library";
import { runRules, type Rule, type RuleViolation } from "@/lib/rules-engine";
import { buildGraph } from "@/lib/knowledge-graph";
import Background from "@/components/Background";
import { decide as decideRoute, type RoutingDecision } from "@/lib/adaptive-router";
import { resolveIntent, type ResolvedIntent } from "@/lib/intent-resolver";
import { appendEvent as appendLedgerEvent } from "@/lib/adaptive-ledger";
import { loadSettings as loadLearningSettings, saveSettings as saveLearningSettings } from "@/lib/adaptive-profile";
import { newOperationId, parseProviderHeader, type OperationSummary } from "@/lib/operation-tracker";
import { useRailResize } from "@/hooks/useRailResize";
import { reviewBuild, summarizeReport, type AgentReview } from "@/lib/chief-engineer";
import { EngineeringConsolePanel } from "@/components/panels/EngineeringConsolePanel";
import { restoreAndVerify } from "@/lib/context-compactor";



export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    const { unlocked } = await ensureUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Obsidian — System builder for people that can't code" },
      { name: "description", content: "Obsidian is an AI system builder — think it, type it, see it. Ship production-ready software without writing code." },
      { property: "og:title", content: "Obsidian — Think it, Type it, See it" },
      { property: "og:description", content: "AI system builder for people that can't code. Ship production-ready software with an AI engineering team." },
      { property: "og:url", content: "https://obsidianvibe.live/" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Obsidian — Think it, Type it, See it" },
      { name: "twitter:description", content: "AI system builder for people that can't code." },
    ],
    links: [{ rel: "canonical", href: "https://obsidianvibe.live/" }],
  }),
  component: Index,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

// Client-side model picker id: registry id, or "auto" (resolves to DEFAULT_MODEL server-side).
// Client-side model picker id: a raw registry ModelId or a user-facing mode.
type PickerModelId = ModelId | ModelModeId;

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
    messages: [{ role: "assistant", content: "Aetheris Obsidian is ready. Tell me what to build." }],
    html: "",
    model: "fast",
    mode: "agent",
    versions: [],
    memory: { ...EMPTY_MEMORY },
    rules: reconcileRules(undefined),
    runtimeEvents: [],
    cost: { ...EMPTY_COST },
  };
}

function Index() {
  // streaming via /api/generate
  const initialSession = useMemo(() => newSession(), []);
  const [sessions, setSessions] = useState<Session[]>(() => [initialSession]);
  const [activeId, setActiveId] = useState<string>(() => initialSession.id);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [buildChatOpen, setBuildChatOpen] = useState(false);
  const [ideaOffset, setIdeaOffset] = useState(0);
  const ideaSeed = useMemo(() => Math.floor(Math.random() * 100000) + 1, []);
  const [aiIdeas, setAiIdeas] = useState<Addon[]>([]);
  const [aiIdeasLoading, setAiIdeasLoading] = useState(false);
  const [ideaCategory, setIdeaCategory] = useState<string>("all");
  const seenIdeaLabelsRef = useRef<Set<string>>(new Set());
  const [savedIdeas, setSavedIdeas] = useState<Addon[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("obs.savedIdeas");
      return raw ? (JSON.parse(raw) as Addon[]) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("obs.savedIdeas", JSON.stringify(savedIdeas)); } catch {}
  }, [savedIdeas]);
  const savedIdeasHydratedRef = useRef<string>("");

  const [nextSteps, setNextSteps] = useState<Addon[]>([]);
  const [nextStepsLoading, setNextStepsLoading] = useState(false);
  const generateStarterIdeasFn = useServerFn(generateStarterIdeas);
  const anticipateNextIdeasFn = useServerFn(anticipateNextIdeas);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const isMobileViewport = useIsMobile();
  const [forceSimple, setForceSimple] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("obs-simple-view") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("obs-simple-view", forceSimple ? "1" : "0"); } catch { /* ignore */ }
  }, [forceSimple]);
  const isMobile = isMobileViewport || forceSimple;
  type MobTab = "chat" | "preview" | "files" | "build" | "more";
  const [mobileTab, setMobileTabState] = useState<MobTab>("preview");
  // Persist mobile tab per session/project so switching within a project keeps it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(`obs.mobileTab.${activeId}`);
      if (raw === "chat" || raw === "preview" || raw === "files" || raw === "build" || raw === "more") {
        setMobileTabState(raw);
      } else {
        setMobileTabState("preview");
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  const setMobileTab = (t: MobTab) => {
    setMobileTabState(t);
    try { window.sessionStorage.setItem(`obs.mobileTab.${activeId}`, t); } catch { /* ignore */ }
    if (t === "files") setTab("code");
    if (t === "preview") setTab("preview");
  };
  // Mobile preview zoom (0.5x – 2x). Persisted per session.
  const [mobZoom, setMobZoom] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const raw = Number(window.sessionStorage.getItem("obs.mobZoom"));
    return raw >= 0.5 && raw <= 2 ? raw : 1;
  });
  useEffect(() => {
    try { window.sessionStorage.setItem("obs.mobZoom", String(mobZoom)); } catch { /* ignore */ }
  }, [mobZoom]);
  const zoomIn = () => setMobZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setMobZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
  const zoomReset = () => setMobZoom(1);
  const [loading, setLoading] = useState(false);
  // Per-session build indicator: tab strip shows a spinner when its build is
  // still in flight even if the user has switched to another tab.
  const [buildingIds, setBuildingIds] = useState<Set<string>>(() => new Set());
  const [pushedDemoIds, setPushedDemoIds] = useState<Set<string>>(() => new Set());
  // Map: session.id -> {demoId, slug} for the live demo entry it owns. Persist
  // so re-opening the tab still knows this build is on the public gallery and
  // pressing the button again toggles it off (removes) rather than duplicates.
  type DemoRef = { demoId: string; slug: string };
  const [demoBySession, setDemoBySession] = useState<Record<string, DemoRef>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("obs.demoBySession");
      return raw ? (JSON.parse(raw) as Record<string, DemoRef>) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("obs.demoBySession", JSON.stringify(demoBySession)); } catch {}
  }, [demoBySession]);
  const markBuildStart = (sid: string) => setBuildingIds((prev) => { const n = new Set(prev); n.add(sid); return n; });
  const markBuildEnd = (sid: string) => setBuildingIds((prev) => { const n = new Set(prev); n.delete(sid); return n; });
  // Reset the "Push to Demos" toggle back to red and, if this session owns a
  // featured demo entry, remove it from the public gallery.
  async function resetDemoStatus(sid: string) {
    const existing = demoBySession[sid];
    setDemoBySession((prev) => { const n = { ...prev }; delete n[sid]; return n; });
    setPushedDemoIds((prev) => { const n = new Set(prev); n.delete(sid); return n; });
    if (existing) {
      try { await deleteFeaturedDemo({ data: { adminCode: "9822", id: existing.demoId } }); } catch { /* non-fatal */ }
    }
  }
  // Multi-prompt queue: submitting while another build runs enqueues.
  type QueuedPrompt = { sid: string; prompt: string };
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  // Idea memory (per browser): labels/snippets of ideas the user has already
  // built so we stop re-suggesting them.
  const [builtIdeas, setBuiltIdeas] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("obs.builtIdeas");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const recordBuiltIdea = (labelOrSnippet: string) => {
    const key = labelOrSnippet.trim().toLowerCase().slice(0, 120);
    if (!key) return;
    setBuiltIdeas((prev) => {
      if (prev.has(key)) return prev;
      const n = new Set(prev); n.add(key);
      try { window.localStorage.setItem("obs.builtIdeas", JSON.stringify(Array.from(n).slice(-400))); } catch {}
      return n;
    });
  };
  // Ideas that were built AND then pushed live (Go Live / Push to Demos).
  const [liveIdeas, setLiveIdeas] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("obs.liveIdeas");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const recordLiveIdea = (labelOrSnippet: string | null | undefined) => {
    if (!labelOrSnippet) return;
    const key = labelOrSnippet.trim().toLowerCase().slice(0, 120);
    if (!key) return;
    setLiveIdeas((prev) => {
      if (prev.has(key)) return prev;
      const n = new Set(prev); n.add(key);
      try { window.localStorage.setItem("obs.liveIdeas", JSON.stringify(Array.from(n).slice(-400))); } catch {}
      return n;
    });
    recordBuiltIdea(labelOrSnippet);
  };
  // Tracks the last idea label the user clicked into the composer, so when
  // they push that build live we can mark the source idea as "already made".
  const activeIdeaLabelRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAiError, setLastAiError] = useState<AiErrorEnvelope | null>(null);
  const lastSubmitRef = useRef<{ prompt: string; attachments: Attachment[] } | null>(null);
  const [activeNav, setActiveNav] = useState<string>("projects");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("obs.sidebarCollapsed");
    return v === null ? true : v === "1";
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

  // Adaptive learning defaults to ON via DEFAULT_SETTINGS. Respect the user's
  // choice — do NOT force-enable on mount (that overrode a deliberate opt-out).

  // Resizable right-rail — logic and math extracted to useRailResize hook.
  const {
    railWidth,
    onResizeStart: onRailResizeStart,
    onKeyDown: onRailKeyDown,
    resetWidth: resetRailWidth,
    ariaMin: railAriaMin,
    ariaMax: railAriaMax,
  } = useRailResize();

  // First-visit intro audio is owned by <IntroSplash /> now — legacy audio
  // effect removed to prevent double-play + races with the splash timeline.



  // Per-card collapse in the right rail. Injects a chevron button into every
  // `.obs-rail .obs-card` header and persists collapsed state per card key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rail = document.querySelector(".obs-rail");
    if (!rail) return;
    const STORAGE_KEY = "obs.railCardCollapsed.v1";
    let state: Record<string, boolean> = {};
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch {}
    const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };

    const enhance = () => {
      const cards = rail.querySelectorAll<HTMLElement>(".obs-card");
      cards.forEach((card) => {
        if (card.dataset.collapsibleReady === "1") return;
        const head = card.querySelector<HTMLElement>(".obs-card-head, .obs-card-title");
        if (!head) return;
        const labelEl = head.querySelector(".obs-card-label, .obs-card-title") as HTMLElement | null;
        const key = (card.id || labelEl?.textContent || head.textContent || "").trim().slice(0, 80);
        if (!key) return;
        card.dataset.collapsibleKey = key;
        card.dataset.collapsibleReady = "1";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "obs-card-collapse-btn";
        btn.setAttribute("aria-label", "Toggle section");
        btn.innerHTML = "<span aria-hidden=\"true\">▾</span>";
        btn.style.marginLeft = "auto";
        head.style.cursor = "pointer";
        // Keep native controls inside the head clickable
        head.addEventListener("click", (e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button, a, input, select, textarea, label") && !t.classList.contains("obs-card-collapse-btn")) return;
          apply(!card.classList.contains("is-collapsed"));
        });
        btn.addEventListener("click", (e) => { e.stopPropagation(); apply(!card.classList.contains("is-collapsed")); });
        head.appendChild(btn);

        const apply = (collapsed: boolean) => {
          card.classList.toggle("is-collapsed", collapsed);
          btn.setAttribute("aria-expanded", String(!collapsed));
          btn.firstElementChild!.textContent = collapsed ? "▸" : "▾";
          state[key] = collapsed;
          save();
        };
        apply(key in state ? !!state[key] : true);
      });
    };

    enhance();
    const mo = new MutationObserver(() => enhance());
    mo.observe(rail, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const [terminal, setTerminal] = useState<string[]>([
    "· Sandbox ready — no build yet",
  ]);
  const [lastMetrics, setLastMetrics] = useState<GenerationMetrics | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [stage, setStage] = useState<StageName | null>(null);
  const [stageDetail, setStageDetail] = useState<string>("");
  const [railGroup, setRailGroup] = useState<RailGroupId>("all");
  const [intelligenceTick, setIntelligenceTick] = useState<number>(0);
  const [lastIntent, setLastIntent] = useState<ResolvedIntent | undefined>(undefined);
  const [lastDecision, setLastDecision] = useState<RoutingDecision | undefined>(undefined);
  const [lastOperation, setLastOperation] = useState<OperationSummary | undefined>(undefined);
  const [engineeringReport, setEngineeringReport] = useState<import("@/lib/chief-engineer").EngineeringReport | null>(null);
  const [engineeringLive, setEngineeringLive] = useState<import("@/lib/chief-engineer").AgentReview[]>([]);
  const [engineeringRunning, setEngineeringRunning] = useState(false);
  const [engineeringBypass, setEngineeringBypass] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [inspectorEnabled, setInspectorEnabled] = useState(false);
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection>(null);
  // Library code is session-scoped: each new browser session starts blank
  // and the user re-enters their private code to "log in" and load their
  // prior builds from the server.
  const [libraryCode, setLibraryCode] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return window.sessionStorage.getItem("obs.library_code") || ""; } catch { return ""; }
  });
  // Cross-device sync of saved ideas keyed by the user's library code.
  // On code change: fetch server copy and merge with local bookmarks.
  // On savedIdeas change: debounce-persist so returning devices see them.
  useEffect(() => {
    const code = libraryCode.trim();
    if (!code || code.length < 4) return;
    if (savedIdeasHydratedRef.current === code) return;
    savedIdeasHydratedRef.current = code;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/saved-ideas/${encodeURIComponent(code)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { ideas?: Addon[] };
        const remote = Array.isArray(data.ideas) ? data.ideas : [];
        if (cancelled || remote.length === 0) return;
        setSavedIdeas((local) => {
          const key = (a: Addon) => (a.snippet || "").trim().toLowerCase();
          const seen = new Set<string>();
          const merged: Addon[] = [];
          for (const item of [...remote, ...local]) {
            const k = key(item);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            merged.push({ ...item, id: item.id || "saved-" + Math.random().toString(36).slice(2) });
          }
          return merged.slice(0, 40);
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [libraryCode]);
  useEffect(() => {
    const code = libraryCode.trim();
    if (!code || code.length < 4) return;
    if (savedIdeasHydratedRef.current !== code) return;
    const handle = window.setTimeout(() => {
      fetch(`/api/public/saved-ideas/${encodeURIComponent(code)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ideas: savedIdeas }),
      }).catch(() => {});
    }, 600);
    return () => window.clearTimeout(handle);
  }, [savedIdeas, libraryCode]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingInitialPrice, setPricingInitialPrice] = useState<string | undefined>(undefined);
  const [accountOpen, setAccountOpen] = useState(false);
  const { userId: authUserId, email: authEmail } = useAuth();
  const { isPro } = useSubscription();

  // Global paywall handler — authFetch dispatches obs:paywall on 401/402
  // from any gated route. Open PricingModal and surface a terminal note
  // without losing the user's in-flight work.
  useEffect(() => {
    function onPaywall(e: Event) {
      const ce = e as CustomEvent<{ envelope: { code: string; message: string; suggestedPriceId?: string } }>;
      const env = ce.detail?.envelope;
      if (!env) return;
      setPricingInitialPrice(env.suggestedPriceId);
      setPricingOpen(true);
      setTerminal((t) => [...t, `⚠ ${env.message}`]);
    }
    window.addEventListener("obs:paywall", onPaywall as EventListener);
    return () => window.removeEventListener("obs:paywall", onPaywall as EventListener);
  }, []);

  // Refresh entitlement whenever the auth identity changes so the guard's
  // snapshot reflects the current session immediately after sign-in/out.
  useEffect(() => { void refreshEntitlement(); }, [authUserId]);


  const [libraryBuilds, setLibraryBuilds] = useState<Array<{ id: string; title: string; created_at: string; prompt: string; share_slug: string; byte_size: number }>>([]);
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    if (typeof window === "undefined") return 72;
    const n = Number(localStorage.getItem("obs.composer_h"));
    return Number.isFinite(n) && n >= 40 ? Math.min(n, 800) : 72;
  });
  const [composerWidth, setComposerWidth] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const n = Number(localStorage.getItem("obs.composer_w"));
    return Number.isFinite(n) && n >= 240 ? Math.min(n, 1600) : null;
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("obs.composer_h", String(composerHeight));
  }, [composerHeight]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (composerWidth) localStorage.setItem("obs.composer_w", String(composerWidth));
    else localStorage.removeItem("obs.composer_w");
  }, [composerWidth]);
  // Draggable composer position (null = docked in rail).
  const [composerPos, setComposerPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("obs.composer_pos");
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p?.x === "number" && typeof p?.y === "number") return p;
    } catch { /* ignore */ }
    return null;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (composerPos) localStorage.setItem("obs.composer_pos", JSON.stringify(composerPos));
    else localStorage.removeItem("obs.composer_pos");
  }, [composerPos]);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const dragStateRef = useRef<{ dx: number; dy: number } | null>(null);
  function onComposerDragStart(e: React.PointerEvent) {
    e.preventDefault();
    const el = composerFormRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragStateRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    // If not yet floating, seed at current on-screen position.
    if (!composerPos) setComposerPos({ x: rect.left, y: rect.top });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      const w = el.offsetWidth || 360;
      const h = el.offsetHeight || 80;
      const x = Math.max(4, Math.min(window.innerWidth - w - 4, ev.clientX - s.dx));
      const y = Math.max(4, Math.min(window.innerHeight - h - 4, ev.clientY - s.dy));
      setComposerPos({ x, y });
    };
    const onUp = () => {
      dragStateRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  const [enhancing, setEnhancing] = useState(false);
  const runEnhance = useServerFn(enhancePromptFn);
  async function handleEnhance() {
    const draft = input.trim();
    if (!draft || enhancing || loading) return;
    const gate = await requirePaidAction("enhance_prompt");
    if (!gate.allowed) return;
    setEnhancing(true);
    try {
      const res = await runEnhance({ data: { prompt: draft, hasHtml: !!current.html } });
      if (res && "paywall" in res) {
        window.dispatchEvent(new CustomEvent("obs:paywall", {
          detail: { envelope: res.paywall, status: res.paywall.code === "auth_required" ? 401 : 402, url: "enhance" },
        }));
        return;
      }
      if (res && "prompt" in res && res.prompt) setInput(res.prompt);
    } catch (e) {
      console.error("enhance failed", e);
    } finally {
      setEnhancing(false);
    }
  }
  function appendAddon(a: Addon) {
    activeIdeaLabelRef.current = a.label;
    setInput((prev) => {
      const base = prev.trim();
      if (!base) return a.snippet;
      return base.endsWith(".") ? `${base} ${a.snippet}` : `${base}. ${a.snippet}`;
    });
    // On mobile the composer lives in the Chat tab — bring the user there so
    // they immediately see the idea land in the prompt box.
    if (isMobile && mobileTab !== "chat") setMobileTab("chat");
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.focus();
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* ignore */ }
      }
    });
  }

  const [expandingIdeaId, setExpandingIdeaId] = useState<string | null>(null);
  const [expandingDraft, setExpandingDraft] = useState(false);
  // "Expand draft" — composer button: each press asks the AI for the next
  // best addon based on whatever is currently in the prompt box, and appends
  // it. Press again to grow the prompt one step further.
  // Race any anticipate call against a hard timeout so a stalled AI Gateway
  // response can never leave the "Expand" spinner stuck forever.
  async function anticipateWithTimeout(payload: { draft: string; hasHtml: boolean; count: number }, ms = 15000) {
    return await Promise.race([
      anticipateNextIdeasFn({ data: payload }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("expand-timeout")), ms)),
    ]);
  }

  // "Expand draft" — composer button: each press asks the AI for the next
  // best addon based on whatever is currently in the prompt box, and appends
  // it. Press again to grow the prompt one step further.
  async function expandDraft() {
    if (expandingDraft || loading) return;
    const draft = (composerRef.current?.value ?? input).trim();
    if (!draft) return;
    setExpandingDraft(true);
    try {
      const res = await anticipateWithTimeout({ draft, hasHtml: !!current.html, count: 3 });
      const next = res?.ideas?.find((i) => i?.snippet)?.snippet;
      if (!next) return;
      setInput((prev) => {
        const base = prev.trim();
        if (!base) return next;
        if (base.toLowerCase().includes(next.slice(0, 24).toLowerCase())) return base;
        return base.endsWith(".") ? `${base} ${next}` : `${base}. ${next}`;
      });
    } catch (e) {
      console.error("expand draft failed", e);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("credit_limit")) setError("Daily AI credit limit reached — expansion paused. Reset at midnight UTC or raise your workspace daily cap.");
      else if (msg.includes("rate_limited")) setError("AI is rate-limited right now — try again in a moment.");
      else if (msg === "expand-timeout") setError("Expansion timed out — try again.");
    } finally {
      setExpandingDraft(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }
  // "Expand idea": iteratively asks the AI for the next best addon based on
  // the current draft and appends it. Runs a few rounds so one click grows
  // the prompt into a fuller brief without further clicks.
  async function expandIdea(seed: Addon) {
    if (expandingIdeaId) return;
    setExpandingIdeaId(seed.id);
    try {
      // Seed the composer with the idea if empty; otherwise keep user's text.
      setInput((prev) => {
        const base = prev.trim();
        if (!base) return seed.snippet;
        return base.endsWith(".") ? `${base} ${seed.snippet}` : `${base}. ${seed.snippet}`;
      });
      await new Promise((r) => setTimeout(r, 30));
      for (let round = 0; round < 4; round++) {
        const draft = (composerRef.current?.value ?? "").trim() || seed.snippet;
        let res;
        try {
          res = await anticipateWithTimeout({ draft, hasHtml: !!current.html, count: 2 }, 12000);
        } catch { break; }
        const next = res?.ideas?.[0];
        if (!next?.snippet) break;
        setInput((prev) => {
          const base = prev.trim();
          if (!base) return next.snippet;
          if (base.toLowerCase().includes(next.snippet.slice(0, 24).toLowerCase())) return base;
          return base.endsWith(".") ? `${base} ${next.snippet}` : `${base}. ${next.snippet}`;
        });
        await new Promise((r) => setTimeout(r, 40));
      }
    } finally {
      setExpandingIdeaId(null);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.sessionStorage.setItem("obs.library_code", libraryCode); } catch {}
  }, [libraryCode]);
  function refreshLibrary() {
    const code = libraryCode.trim();
    if (!code) { setLibraryBuilds([]); return; }
    fetch(`/api/public/library/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : { builds: [] }))
      .then((d) => setLibraryBuilds(d.builds || []))
      .catch(() => setLibraryBuilds([]));
  }

  // ─── Entitlement (mode = owner | pro | free) — the ONLY gate. Free users
  // get zero AI/cloud/GitHub calls; local editing remains fully functional.
  const { snap: entitlement } = useEntitlement();
  const modeLabel =
    entitlement.mode === "owner" ? "Owner" :
    entitlement.mode === "pro"   ? "Pro" :
                                   "Local Only";

  function openUpgrade(priceId?: string) {
    setPricingInitialPrice(priceId);
    setPricingOpen(true);
  }

  async function saveProject() {
    if (!current.html) {
      setTerminal((t) => [...t, "✗ Nothing to save yet — build something first."]);
      return;
    }
    // Central guard — never allow a cloud save from Local Only.
    const gate = await requirePaidAction("cloud_save");
    if (!gate.allowed) {
      setTerminal((t) => [...t, "→ Save Project requires Obsidian Pro. Local editing and export remain free."]);
      return;
    }
    let code = libraryCode.trim();
    if (!code) {
      const entered = window.prompt(
        "Enter a library code to save under (4-64 chars). Use the same code across devices to see your projects anywhere.",
        "",
      );
      if (!entered) return;
      code = entered.replace(/\s+/g, "");
      if (code.length < 4 || code.length > 64) {
        setTerminal((t) => [...t, "✗ Library code must be 4–64 characters."]);
        return;
      }
      setLibraryCode(code);
    }
    const suggested = current.title && current.title !== "Untitled"
      ? current.title
      : (current.messages.find((m) => m.role === "user")?.content?.slice(0, 60) || "Untitled");
    const title = window.prompt("Save project as:", suggested);
    if (!title) return;
    setTerminal((t) => [...t, `→ Saving "${title}" to library…`]);
    try {
      let clientId = localStorage.getItem("obs.client_id");
      if (!clientId) {
        clientId = (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
        localStorage.setItem("obs.client_id", clientId);
      }
      const res = await authFetch("/api/public/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt: current.messages.find((m) => m.role === "user")?.content?.slice(0, 400) || "",
          html: current.html,
          model: current.model,
          session_id: current.id,
          client_id: clientId,
          library_code: code,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      updateCurrent({ title });
      setTerminal((t) => [...t, `✓ Saved "${title}" to library (${code})`]);
      refreshLibrary();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      setTerminal((t) => [...t, `✗ Save failed: ${msg}`]);
    }
  }

  async function openLibraryBuild(id: string, opts: { duplicate: boolean }) {
    const code = libraryCode.trim();
    if (!code) return;
    try {
      const res = await fetch(`/api/public/library/${encodeURIComponent(code)}/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { title?: string; html: string; prompt?: string; model?: string };
      if (opts.duplicate) {
        const s = newSession();
        s.title = (data.title ? `${data.title} (copy)` : "Copy").slice(0, 60);
        s.html = data.html;
        s.messages = [
          { role: "assistant", content: `Opened "${data.title ?? "Untitled"}" as a duplicate. Iterate away.` },
        ];
        setSessions((all) => [...all, s]);
        setActiveId(s.id);
        setTab("preview");
        setLibraryOpen(false);
        setTerminal((t) => [...t, `✓ Duplicated "${data.title ?? "Untitled"}" into a new tab`]);
      } else {
        updateCurrent({
          title: data.title || "Untitled",
          html: data.html,
          messages: [
            ...current.messages,
            { role: "assistant", content: `Loaded "${data.title ?? "Untitled"}" from your library.` },
          ],
        });
        setTab("preview");
        setLibraryOpen(false);
        setTerminal((t) => [...t, `✓ Opened "${data.title ?? "Untitled"}" in this tab`]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "open failed";
      setTerminal((t) => [...t, `✗ Open failed: ${msg}`]);
    }
  }



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
    // Session-scoped: every new browser session starts blank. To continue
    // prior work, the user enters their library code and opens a build.
    const parsed = sessionSafeGet<Session[]>(STORAGE_KEY);
    const activeRaw = sessionSafeGet<string>(ACTIVE_KEY);
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
      const ok = sessionSafeSet(STORAGE_KEY, sessions);
      if (!ok) setTerminal((t) => (t[t.length - 1]?.includes("Storage quota") ? t : [...t, "! Storage quota exceeded — session not persisted"]));
    }, 250);
    return () => { if (writeTimerRef.current) clearTimeout(writeTimerRef.current); };
  }, [sessions, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    sessionSafeSet(ACTIVE_KEY, activeId);
    // Cancel any stale in-flight request when the active session changes.
    abortRef.current?.abort();
  }, [activeId, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [current.messages, loading, activeId]);

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

  // Anticipate next-step ideas from the in-progress prompt. Debounced, free,
  // and quietly ignored on failure so it never blocks typing.
  useEffect(() => {
    const draft = input.trim();
    if (draft.length < 12) {
      setNextSteps([]);
      setNextStepsLoading(false);
      return;
    }
    let cancelled = false;
    setNextStepsLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await anticipateNextIdeasFn({ data: { draft, hasHtml: !!current.html, count: 3 } });
        if (cancelled) return;
        setNextSteps((res.ideas ?? []).map((i) => ({ id: i.id, label: i.label, snippet: i.snippet } as Addon)));
      } catch {
        if (!cancelled) setNextSteps([]);
      } finally {
        if (!cancelled) setNextStepsLoading(false);
      }
    }, 650);
    return () => { cancelled = true; window.clearTimeout(t); setNextStepsLoading(false); };
  }, [input, current.html, anticipateNextIdeasFn]);


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

  const [fusionOpen, setFusionOpen] = useState(false);
  function commitFusion(c: FusionCommit) {
    const now = Date.now();
    const checkpoint: Version = {
      id: (globalThis.crypto?.randomUUID?.() ?? String(now)),
      ts: now,
      html: c.result.checkpointHtml || "",
      label: "Pre-fusion checkpoint",
      protected: true,
    };
    const fused: Version = {
      id: (globalThis.crypto?.randomUUID?.() ?? String(now + 1)),
      ts: now + 1,
      html: c.html,
      label: `Fusion (${c.result.plan.mode})`,
    };
    const s: Session = {
      ...newSession(),
      title: c.title,
      html: c.html,
      messages: [
        { role: "assistant", content: `Fused ${c.result.metrics.projectsCombined} projects (${c.result.plan.mode}). ${c.result.metrics.filesAdded} sections, ${c.result.metrics.filesDeduplicated} deduped, ${c.result.metrics.conflictsResolved} conflicts auto-resolved.` },
      ],
      versions: [checkpoint, fused],
    };
    setSessions((all) => [...all, s]);
    setActiveId(s.id);
    setTerminal((t) => [
      ...t,
      `⧗ Fusion: inventory → compatibility → conflict detection → plan → merge → validation → commit`,
      `✓ Fused ${c.result.metrics.projectsCombined} projects in ${c.result.metrics.totalMs}ms (validated in ${c.result.metrics.validationMs}ms)`,
      `  · files added ${c.result.metrics.filesAdded} · deduped ${c.result.metrics.filesDeduplicated} · routes ${c.result.metrics.routesCreated}`,
      `  · conflicts auto-resolved ${c.result.metrics.conflictsResolved} · needs input ${c.result.metrics.conflictsRequiringInput}`,
    ]);
    setFusionOpen(false);
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
    resetDemoStatus(activeId);
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
    const restoreOpId = newOperationId();
    setLastOperation({
      operationId: restoreOpId,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      durationMs: 0,
      requestedModel: version.metadata?.model ?? "n/a",
      actualModel: version.metadata?.actualModel ?? version.metadata?.model ?? "n/a",
      strategy: "restore",
      taskType: version.metadata?.taskType ?? "unknown",
      providerChain: version.metadata?.providerChain?.slice() ?? [],
      imageProviders: version.metadata?.imageProviders,
      imageCount: version.metadata?.imageCount,
      validationStatus: version.metadata?.validation.status,
      outcome: "restored",
      rollbackId: version.id,
      reason: version.label.slice(0, 60),
    });
    try {
      appendLedgerEvent({ kind: "version-restored", outcome: "restored", note: version.label });
      setIntelligenceTick((n) => n + 1);
    } catch { /* best-effort */ }
  }

  type Attachment =
    | { kind: "image"; name: string; dataUrl: string }
    | { kind: "text"; name: string; text: string; source: "text" | "pdf" };
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [captureMode, setCaptureMode] = useState<null | "full" | "snip">(null);
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
    if (!basePrompt && pendingAttachments.length === 0) return;
    // Multi-prompt queue: allow submitting another prompt while one is
    // building — it will run as soon as the current build finishes.
    if (loading) {
      if (!basePrompt) return;
      setPromptQueue((q) => [...q, { sid: activeId, prompt: basePrompt }].slice(-8));
      setInput("");
      return;
    }
    // Central guard — free/unresolved users never reach the network.
    const gate = await requirePaidAction("generate_html");
    if (!gate.allowed) return;
    const activeMode = current.mode;
    // Chat and Plan modes must NEVER overwrite the live preview — they are advisory.
    const previewMode = activeMode !== "chat" && activeMode !== "plan";
    // Starting a real build resets the "Push to Demos" toggle back to red and
    // removes any previously featured entry for this session.
    if (previewMode) resetDemoStatus(activeId);
    // Stable snapshot: never let a failed edit corrupt the last good HTML.
    const stableHtml = current.html;

    // 1. Classify.
    const classification = classifyTask(basePrompt, { mode: activeMode, hasHtml: !!stableHtml });
    const t0 = performance.now();

    // 1b. Adaptive routing — auto-picks model/strategy from classification +
    // learned signals. Explicit picker choice always wins.
    const routing = decideRoute({
      prompt: basePrompt,
      hasHtml: !!stableHtml,
      mode: activeMode,
      pickerModel: current.model,
      hasAttachments: pendingAttachments.length > 0,
    });
    const adaptiveModel = routing.chosenModel;
    const requestedModel: string = current.model === "auto" ? routing.plan.model : resolveModel(current.model as string);
    const operationId = newOperationId();
    const resolvedIntent = resolveIntent(basePrompt, {
      hasHtml: !!stableHtml,
      attachmentsCount: pendingAttachments.length,
      recentOperationSummary: current.messages.slice(-2).map((m) => m.content.slice(0, 60)).join(" | "),
    });
    setLastIntent(resolvedIntent);
    setLastDecision(routing);
    setLastOperation({
      operationId,
      startedAt: Date.now(),
      requestedModel,
      actualModel: adaptiveModel,
      strategy: routing.chosenStrategy,
      taskType: classification.taskType,
      providerChain: [],
      outcome: "pending",
      learningSignals: routing.signalsUsed.slice(),
      rollbackId: current.versions?.[0]?.id,
    });
    setIntelligenceTick((n) => n + 1);

    setError(null);
    setLastAiError(null);
    lastSubmitRef.current = { prompt: basePrompt, attachments: [...pendingAttachments] };
    setInput("");
    setPendingAttachments([]);
    const nextHistory: ChatMsg[] = [...current.messages, { role: "user", content: basePrompt || "(attachment only)" }];
    const isFirstUserMsg = !current.messages.some((m) => m.role === "user");
    updateCurrent({
      messages: nextHistory,
      title: isFirstUserMsg ? (basePrompt || pendingAttachments[0]?.name || "Untitled").slice(0, 28) : current.title,
    });
    setLoading(true);
    markBuildStart(activeId);
    setStage("classify");
    setStageDetail(classification.taskType);
    setTerminal((t) => [
      ...t,
      `→ [${classification.taskType}] via ${classification.executionPath}`,
      `→ Auto-routed → ${adaptiveModel} · ${routing.why}`,
    ]);
    try {
      appendLedgerEvent({ kind: "task-classified", taskType: classification.taskType, strategy: classification.strategy });
      appendLedgerEvent({ kind: "strategy-selected", taskType: classification.taskType, strategy: routing.chosenStrategy });
      appendLedgerEvent({ kind: "model-selected", taskType: classification.taskType, model: adaptiveModel, note: routing.signalsUsed.join(",") });
    } catch { /* ledger is best-effort */ }
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
            setLoading(false); setStage(null); markBuildEnd(sessionId);
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
          setLoading(false); setStage(null); markBuildEnd(sessionId);
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

      const modelForPatch = adaptiveModel;
      const outline = outlineToPrompt(extractOutline(stableHtml));
      const memoryStr = memoryToPrompt(current.memory);
      const patchController = new AbortController();
      abortRef.current = patchController;
      try {
        setTerminal((t) => [...t, `→ Patch mode → ${modelForPatch}`]);
        const pRes = await authFetch("/api/patch", {
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
        const pCtype = (pRes.headers.get("content-type") || "").toLowerCase();
        let pJson:
          | { ok: true; patch: unknown; model: string; fallbackUsed: boolean; requestId?: string }
          | { ok: false; error: string; fallbackUsed: boolean; model: string; requestId?: string }
          | AiErrorEnvelope;
        if (pCtype.includes("application/json")) {
          pJson = await pRes.json();
        } else {
          // Non-JSON body from /api/patch is a transport failure. Preserve
          // stable HTML and surface the error — never fall through to a full
          // regeneration on transport errors (that could destroy work the user
          // already had).
          const envelope: AiErrorEnvelope = {
            ok: false, code: "ai_upstream_malformed", stage: "patch",
            message: "Patch service returned a non-JSON body. Your last stable build is preserved.",
            retryable: true, requestId: `local_${Date.now().toString(36)}`,
          };
          setLastAiError(envelope); setError(envelope.message);
          setTerminal((t) => [...t, `✗ Patch transport: non-JSON body (stable HTML preserved).`]);
          abortRef.current = null; setLoading(false); setStage(null); markBuildEnd(sessionId);
          return;
        }
        if (isAiErrorEnvelope(pJson)) {
          // Transport-layer failure — retryable or not, DO NOT silently
          // fall through to full generation. Surface it; user can Retry.
          setLastAiError(pJson); setError(pJson.message);
          setTerminal((t) => [...t, `✗ Patch: ${pJson.message} (id ${pJson.requestId})`]);
          abortRef.current = null; setLoading(false); setStage(null); markBuildEnd(sessionId);
          return;
        }

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
            setLoading(false); setStage(null); markBuildEnd(sessionId);
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
          setLoading(false); setStage(null); markBuildEnd(sessionId);
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
    const modelForServer = adaptiveModel;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentHtml: previewMode ? stableHtml : stableHtml.slice(0, 8000),
          history: current.messages.slice(-6).filter((m) => !(m.role === "assistant" && /^(done|✓|✅|updated|ok\b)/i.test(m.content.trim()))).slice(-4),
          model: modelForServer,
          pickerModel: current.model,
          advisory: !previewMode,
        }),
        signal: controller.signal,
      });

      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      const imgProviders = res.headers.get("x-obs-image-providers");
      const imgCount = Number(res.headers.get("x-obs-image-count") || "0");
      const modelUsedHeader = res.headers.get("x-obs-model-used");
      const fallbackHeader = res.headers.get("x-obs-fallback");
      const firstByteHeader = res.headers.get("x-obs-first-byte-ms");
      const compactInHeader = Number(res.headers.get("x-obs-compact-in") || "0");
      const compactOutHeader = Number(res.headers.get("x-obs-compact-out") || "0");
      if (imgCount > 0 && imgProviders && imgProviders !== "none") {
        setTerminal((t) => [...t, `→ Images: ${imgCount} via ${imgProviders}`]);
      }
      if (fallbackHeader === "1" && modelUsedHeader && modelUsedHeader !== modelForServer) {
        setTerminal((t) => [...t, `⇢ Slow-model fallback → ${modelUsedHeader} (first byte ${firstByteHeader}ms)`]);
      }
      if (compactInHeader > compactOutHeader + 1024) {
        setTerminal((t) => [...t, `→ Context: ${(compactInHeader / 1024).toFixed(1)}KB → ${(compactOutHeader / 1024).toFixed(1)}KB`]);
      }
      // AI error envelope arrives as JSON — never treat it as generated code.
      if (ctype.includes("application/json")) {
        let envelope: unknown = null;
        try { envelope = await res.json(); } catch { envelope = null; }
        if (isAiErrorEnvelope(envelope)) {
          setLastAiError(envelope);
          throw new Error(envelope.message);
        }
        throw new Error(`AI request failed (${res.status})`);
      }
      // Only accept an actual streaming body. Never fall back to res.text() as HTML.
      if (!res.ok || !res.body) {
        throw new Error(`AI request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let firstChunkAt = 0;
      let lastPaint = 0;
      const stripTrailer = (s: string) => s.replace(/\s*<!--OBS_TIMING:[\s\S]*?-->\s*$/, "");
      const paintPreview = (force = false) => {
        if (!previewMode) return;
        const now = performance.now();
        if (!force && now - lastPaint < 120) return;
        lastPaint = now;
        const cleaned = stripTrailer(acc).replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
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

      // Server appends two trailing HTML comments, in this order:
      //   <!--OBS_PLACEHOLDERS:{json}-->  (optional — only when images were compacted)
      //   <!--OBS_TIMING:{json}-->        (always)
      // Strip BOTH before anything else touches `acc`, so validation and the
      // saved payload never see diagnostic markers.
      const timingMatch = acc.match(/<!--OBS_TIMING:([\s\S]*?)-->\s*$/);
      if (timingMatch) {
        try {
          const t = JSON.parse(timingMatch[1]) as Record<string, number | string | boolean>;
          setTerminal((tt) => [...tt, `→ Timing: compact ${t.compact_ms}ms · plan/img ${t.image_ms}ms · first ${t.first_byte_ms}ms · stream ${t.stream_ms}ms · total ${t.total_ms}ms`]);
        } catch { /* trailer malformed; ignore */ }
        acc = acc.slice(0, timingMatch.index).trimEnd();
      }
      let placeholderMap: Record<string, string> | null = null;
      const phMatch = acc.match(/<!--OBS_PLACEHOLDERS:([\s\S]*?)-->\s*$/);
      if (phMatch) {
        try {
          placeholderMap = JSON.parse(phMatch[1]) as Record<string, string>;
        } catch { placeholderMap = null; }
        acc = acc.slice(0, phMatch.index).trimEnd();
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

      // Restore originals for any placeholders the model kept. If a placeholder
      // was mutated or a partial marker leaked through, REJECT the new version
      // and keep the prior stable HTML — this is the lossless contract.
      if (placeholderMap && Object.keys(placeholderMap).length > 0) {
        const round = restoreAndVerify(finalHtml, placeholderMap);
        if (!round.ok) {
          setSessions((all) => all.map((s) => s.id === sessionId
            ? { ...s, html: stableHtml, messages: [...s.messages, { role: "assistant", content: `⚠ Rejected: model corrupted ${round.corrupted} image placeholder${round.corrupted === 1 ? "" : "s"}${round.unknown ? ` and hallucinated ${round.unknown}` : ""} — reverted to last stable version.` }] }
            : s));
          setTerminal((tt) => [...tt, `✗ Placeholder integrity failed (corrupted=${round.corrupted} unknown=${round.unknown}) — reverted.`]);
          const durationMs = performance.now() - t0;
          setLastMetrics(metricsFromClassification(classification, {
            usedAi: true,
            model: modelForServer,
            durationMs,
            summary: "Image placeholder integrity rejected; reverted to stable version.",
            validation: { status: "failed", summary: "Placeholder integrity failed", issues: [{ severity: "blocking", code: "placeholder_integrity", level: "fail", message: `Corrupted ${round.corrupted} placeholder(s), ${round.unknown} unknown.` }] },
            documentChanged: false,
            strategy: "full-generation",
          }));
          return;
        }
        finalHtml = round.html;
        setTerminal((tt) => [...tt, `→ Images: restored ${round.restored}${round.dropped ? ` · dropped ${round.dropped}` : ""}`]);
      }

      // Safety net: if the "stream" was actually a JSON error envelope smuggled
      // as text/plain, treat it as a failure instead of wrapping it as HTML.
      const trimmedStart = finalHtml.slice(0, 200).trimStart();
      if (trimmedStart.startsWith("{") && /"ok"\s*:\s*false/.test(trimmedStart)) {
        try {
          const env = JSON.parse(finalHtml);
          if (isAiErrorEnvelope(env)) { setLastAiError(env); throw new Error(env.message); }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message) throw parseErr;
        }
        throw new Error("Upstream returned an error envelope instead of HTML.");
      }
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
      const providerChain = parseProviderHeader(imgProviders);
      const rollbackId = current.versions?.[0]?.id;
      const genMeta: VersionMetadata = {
        ...buildMetadata({
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
        }),
        operationId,
        requestedModel,
        actualModel: modelForServer,
        providerChain: providerChain.length ? providerChain.slice() : [modelForServer],
        imageProviders: imgProviders ?? undefined,
        imageCount: imgCount || undefined,
        rollbackId,
        learningSignals: routing.signalsUsed.slice(),
      };
      const gateBlockersG = checkCommitGate(stableHtml, finalHtml, "full-generation");
      if (gateBlockersG) {
        setSessions((all) => all.map((s) => s.id === sessionId
          ? { ...s, html: stableHtml, messages: [...s.messages, { role: "assistant", content: `⚠ Blocked by rule: ${gateBlockersG.join("; ").slice(0, 200)} — reverted to last stable version.` }] }
          : s));
        setTerminal((t) => [...t, `✗ Rule gate rejected generation: ${gateBlockersG[0].slice(0, 120)}`]);
        pushFeedback(sessionId, { taskType: classification.taskType, strategy: "full-generation", model: modelForServer, validationStatus: validation.status, runtimeErrors: 0, outcome: "rejected", reason: gateBlockersG[0] });
        setLastOperation((prev) => prev && prev.operationId === operationId ? {
          ...prev, finishedAt: Date.now(), durationMs: durationMsGen,
          validationStatus: validation.status, providerChain: genMeta.providerChain ?? [],
          imageProviders: genMeta.imageProviders, imageCount: genMeta.imageCount,
          outcome: "rejected", reason: gateBlockersG[0].slice(0, 120),
        } : prev);
        setIntelligenceTick((n) => n + 1);
        return;
      }

      // Chief Engineer — multi-agent review before commit.
      setEngineeringRunning(true);
      setEngineeringLive([]);
      const chiefPlan = { classification, model: modelForServer, tier: "balanced" as const,
        useDeterministic: false, usePatch: false, useFullGeneration: true, advisory: false,
        reason: "post-generation review" };
      const chiefReport = reviewBuild({
        request: basePrompt, previousHtml: stableHtml, candidateHtml: finalHtml,
        plan: chiefPlan as unknown as import("@/lib/orchestrator").Plan,
        validation, bypass: engineeringBypass,
        onAgent: (r: AgentReview) => setEngineeringLive((prev) => [...prev, r]),
      });
      setEngineeringReport(chiefReport);
      setEngineeringRunning(false);
      genMeta.engineering = summarizeReport(chiefReport);
      setTerminal((t) => [...t,
        `⚙ Chief Engineer: readiness ${chiefReport.readinessScore}/100 (${chiefReport.blocked ? (chiefReport.bypassed ? "bypassed" : "blocked") : "approved"})`,
        ...chiefReport.risks.slice(0, 2).map((r) => `  ⚠ ${r.slice(0, 120)}`),
      ]);
      if (chiefReport.blocked && !chiefReport.bypassed) {
        setSessions((all) => all.map((s) => s.id === sessionId
          ? { ...s, html: stableHtml, messages: [...s.messages, { role: "assistant", content: `⛔ Chief Engineer blocked commit — ${chiefReport.summary} Enable "Bypass" in the Engineering console to override.` }] }
          : s));
        pushFeedback(sessionId, { taskType: classification.taskType, strategy: "full-generation", model: modelForServer, validationStatus: validation.status, runtimeErrors: 0, outcome: "rejected", reason: `chief-engineer:${chiefReport.blockingRoles.join(",")}` });
        setLastOperation((prev) => prev && prev.operationId === operationId ? {
          ...prev, finishedAt: Date.now(), durationMs: durationMsGen,
          validationStatus: validation.status, providerChain: genMeta.providerChain ?? [],
          imageProviders: genMeta.imageProviders, imageCount: genMeta.imageCount,
          outcome: "rejected", reason: `chief-engineer blocked (${chiefReport.blockingRoles.join(",")})`,
        } : prev);
        setIntelligenceTick((n) => n + 1);
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
      setLastOperation((prev) => prev && prev.operationId === operationId ? {
        ...prev, finishedAt: Date.now(), durationMs: durationMsGen,
        validationStatus: validation.status, providerChain: genMeta.providerChain ?? [],
        imageProviders: genMeta.imageProviders, imageCount: genMeta.imageCount,
        outcome: "ok", rollbackId: newVersion.id,
      } : prev);
      try {
        // Ledger keys off operationId to prevent double-counting on
        // Strict-mode double-fire or network retries.
        const events = (await import("@/lib/adaptive-ledger")).loadLedger();
        const already = events.some((e) => (e as { operationId?: string }).operationId === operationId && e.kind === "fullgen-accepted");
        if (!already) {
          appendLedgerEvent({
            kind: "fullgen-accepted",
            taskType: classification.taskType,
            strategy: "full-generation",
            model: modelForServer,
            outcome: "ok",
            durationMs: durationMsGen,
            validationStatus: validation.status,
            note: operationId,
          });
        }
        setIntelligenceTick((n) => n + 1);
      } catch { /* best-effort */ }
      // Auto-save to the user's private library (keyed by their library code).
      try {
        let clientId = localStorage.getItem("obs.client_id");
        if (!clientId) {
          clientId = (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
          localStorage.setItem("obs.client_id", clientId);
        }
        const lib = (localStorage.getItem("obs.library_code") || "").trim();
        authFetch("/api/public/builds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: versionLabel,
            prompt: basePrompt,
            html: finalHtml,
            model: modelForServer,
            session_id: sessionId,
            client_id: clientId,
            library_code: lib || undefined,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d?.id) return;
            const tag = lib ? "library" : "session";
            setTerminal((t) => [...t, `✓ Saved to ${tag} (${String(d.id).slice(0, 8)})`]);
          })
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
      setLoading(false); setStage(null); markBuildEnd(sessionId);
      setStage(null);
      setStageDetail("");
      // Idea memory: remember what the user just built so we stop
      // re-suggesting it in the starter/AI idea rail.
      try { recordBuiltIdea(basePrompt); } catch {}
    }
  }

  // Drain the multi-prompt queue when a build finishes.
  useEffect(() => {
    if (loading) return;
    if (promptQueue.length === 0) return;
    const [next, ...rest] = promptQueue;
    setPromptQueue(rest);
    // Switch to the tab that queued it so streaming lands in the right place.
    if (next.sid !== activeId) setActiveId(next.sid);
    // Defer to next tick so activeId update is applied before submit reads it.
    const t = setTimeout(() => { void submit(next.prompt); }, 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, promptQueue]);




  const kb = current.html ? (current.html.length / 1024).toFixed(1) : "0.0";
  const userTurns = current.messages.filter((m) => m.role === "user").length;
  const versionCount = current.versions?.length ?? 0;
  const specTax = versionCount > 0 ? Math.max(0, Math.round(((userTurns - versionCount) / Math.max(1, userTurns)) * 100)) : 0;

  return (
    <main className={"obs-shell" + (sidebarCollapsed ? " is-sidebar-collapsed" : "") + (railCollapsed ? " is-rail-collapsed" : "") + (isMobile ? ` is-mobile mob-tab-${mobileTab}` : "")}>
      {isMobile && mobileTab === "preview" && current.html && (
        <button
          type="button"
          className="mob-fab"
          aria-label="Ask Obsidian"
          onClick={() => setMobileTab("chat")}
        >
          <Bot className="h-5 w-5" />
          <span>Ask Obsidian</span>
        </button>
      )}
      {isMobile && mobileTab === "preview" && current.html && (
        <div className="mob-zoom" role="group" aria-label="Preview zoom">
          <button type="button" onClick={zoomOut} aria-label="Zoom out" disabled={mobZoom <= 0.5}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={zoomReset} aria-label="Reset zoom" title="Reset zoom">
            {Math.round(mobZoom * 100)}%
          </button>
          <button type="button" onClick={zoomIn} aria-label="Zoom in" disabled={mobZoom >= 2}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { const el = document.querySelector('.obs-preview-wrap'); if (el && (el as HTMLElement).requestFullscreen) (el as HTMLElement).requestFullscreen().catch(() => {}); }} aria-label="Fullscreen">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* IntroSplash now mounted in src/routes/__root.tsx so it runs for every route */}




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
              <div className="obs-user-name">Aetheris Obsidian</div>
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
                    {buildingIds.has(s.id) && <span className="obs-tab-building" aria-label="Building" />}
                    {(() => {
                      const q = promptQueue.filter((p) => p.sid === s.id).length;
                      return q > 0 ? <span className="obs-tab-queued" title={`${q} queued`}>+{q}</span> : null;
                    })()}
                    {isActive && s.html && !buildingIds.has(s.id) && <span className="obs-tab-live">LIVE</span>}
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
              <button
                type="button"
                onClick={() => setFusionOpen(true)}
                className="obs-chip"
                aria-label="Combine projects"
                title="Combine two or more projects into one (Project Fusion)"
              >
                <GitMerge className="h-3.5 w-3.5" /> Combine
              </button>
            </div>
          </div>
          <div className="obs-topbar-right">
            <button
              type="button"
              className={"obs-chip " + (buildChatOpen ? "is-on" : "")}
              onClick={() => setBuildChatOpen((v) => !v)}
              title="Chat with Claude/Grok about ideas to improve this build"
              style={{ borderColor: "rgba(244,161,37,0.45)", color: "#f4a125" }}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Discuss
            </button>
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
              className="obs-chip"
              disabled={!current.html}
              onClick={saveProject}
              title={current.html ? "Save this project to your library so you can reopen or duplicate it later" : "Build something first"}
            >
              <FolderOpen className="h-3.5 w-3.5" /> Save Project
            </button>
            <button
              type="button"
              className="obs-chip obs-chip-gold"
              disabled={!current.html}
              onClick={async () => {
                if (!current.html) return;
                const gate = await requirePaidAction("cloud_share");
                if (!gate.allowed) {
                  setTerminal((t) => [...t, "→ Go Live requires Obsidian Pro. Local export remains free."]);
                  return;
                }
                setTerminal((t) => [...t, "→ Publishing shareable link…"]);
                try {
                  let clientId = localStorage.getItem("obs.client_id");
                  if (!clientId) {
                    clientId = (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
                    localStorage.setItem("obs.client_id", clientId);
                  }
                  const res = await authFetch("/api/public/builds", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: current.title,
                      prompt: current.messages.find((m) => m.role === "user")?.content?.slice(0, 400) || "",
                      html: sanitizeForExport(current.html),
                      model: current.model,
                      session_id: current.id,
                      client_id: clientId,
                      library_code: libraryCode.trim() || undefined,
                    }),
                  });
                  if (!res.ok) throw new Error(await res.text());
                  const { share_slug } = (await res.json()) as { share_slug: string };
                  const liveUrl = `${window.location.origin}/api/public/share/${share_slug}`;
                  try { await navigator.clipboard?.writeText(liveUrl); } catch { /* ignore */ }
                  window.open(liveUrl, "_blank", "noopener,noreferrer");
                  setTerminal((t) => [...t, `✓ Live: ${liveUrl}`, "  (URL copied to clipboard — share anywhere, no login required)"]);
                  if (libraryCode.trim()) refreshLibrary();
                  recordLiveIdea(activeIdeaLabelRef.current);
                  // Note: Go Live only publishes the shareable link. To feature
                  // this build on the public login-page gallery, use the
                  // separate "Push to Demos" button (admin only).


                } catch (e) {
                  const msg = e instanceof Error ? e.message : "publish failed";
                  setTerminal((t) => [...t, `✗ Go Live failed: ${msg}`]);
                }
              }}
              title={current.html ? "Publish a public shareable URL of the current build" : "Build something first"}
            >
              <Rocket className="h-3.5 w-3.5" /> Go Live
            </button>
            {(libraryCode.trim() === "9822" || (authEmail ?? "").toLowerCase() === "aisystemsarchitect@gmail.com") && (() => {
              const existing = demoBySession[current.id];
              const isLive = pushedDemoIds.has(current.id) || !!existing;
              const doPublishAndPromote = async (label: string) => {
                let clientId = localStorage.getItem("obs.client_id");
                if (!clientId) {
                  clientId = (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
                  localStorage.setItem("obs.client_id", clientId);
                }
                const res = await authFetch("/api/public/builds", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: current.title,
                    prompt: current.messages.find((m) => m.role === "user")?.content?.slice(0, 400) || "",
                    html: sanitizeForExport(current.html),
                    model: current.model,
                    session_id: current.id,
                    client_id: clientId,
                    library_code: "9822",
                  }),
                });
                if (!res.ok) throw new Error(await res.text());
                const { share_slug } = (await res.json()) as { share_slug: string };
                const liveUrl = `${window.location.origin}/api/public/share/${share_slug}`;
                const promoted = await pushFeaturedDemo({
                  data: {
                    adminCode: "9822",
                    slug: share_slug,
                    title: current.title || `Demo · ${share_slug}`,
                    category: classifyDemoCategory(current.title, current.messages.find((m) => m.role === "user")?.content),
                    url: liveUrl,
                  },
                });
                if (!("ok" in promoted) || !promoted.ok) {
                  throw new Error("error" in promoted ? promoted.error : "promote failed");
                }
                // If a previous demo exists for this session, remove it so the
                // gallery shows the fresh build instead of duplicating.
                if (existing && existing.demoId !== promoted.id) {
                  try {
                    await deleteFeaturedDemo({ data: { adminCode: "9822", id: existing.demoId } });
                  } catch { /* non-fatal */ }
                }
                setDemoBySession((prev) => ({ ...prev, [current.id]: { demoId: promoted.id, slug: promoted.slug } }));
                setPushedDemoIds((prev) => { const n = new Set(prev); n.add(current.id); return n; });
                try { await navigator.clipboard?.writeText(liveUrl); } catch { /* ignore */ }
                setTerminal((t) => [...t, `${label}: ${liveUrl}`]);
                refreshLibrary();
                recordLiveIdea(activeIdeaLabelRef.current);
              };
              const handlePush = async () => {
                if (!current.html) return;
                if (isLive && existing) {
                  // Second click when already live → REMOVE from public gallery.
                  setTerminal((t) => [...t, "→ Removing from public Demos gallery…"]);
                  try {
                    const del = await deleteFeaturedDemo({ data: { adminCode: "9822", id: existing.demoId } });
                    if ("ok" in del && del.ok) {
                      setDemoBySession((prev) => { const n = { ...prev }; delete n[current.id]; return n; });
                      setPushedDemoIds((prev) => { const n = new Set(prev); n.delete(current.id); return n; });
                      setTerminal((t) => [...t, "✓ Removed from Demos."]);
                    } else {
                      setTerminal((t) => [...t, `✗ Remove failed: ${"error" in del ? del.error : "unknown"}`]);
                    }
                  } catch (e) {
                    setTerminal((t) => [...t, `✗ Remove failed: ${e instanceof Error ? e.message : "err"}`]);
                  }
                  return;
                }
                setTerminal((t) => [...t, "→ Pushing to public Demos gallery…"]);
                try { await doPublishAndPromote("★ Live on Demos"); }
                catch (e) { setTerminal((t) => [...t, `✗ Push failed: ${e instanceof Error ? e.message : "err"}`]); }
              };
              const handleUpdate = async () => {
                if (!current.html || !existing) return;
                setTerminal((t) => [...t, "→ Updating Demo with the latest build…"]);
                try { await doPublishAndPromote("↻ Demo updated"); }
                catch (e) { setTerminal((t) => [...t, `✗ Update failed: ${e instanceof Error ? e.message : "err"}`]); }
              };
              const liveGreen = { background: "rgba(34,197,94,0.16)", borderColor: "rgba(34,197,94,0.55)", color: "#7ee2a4" } as const;
              const offRed = { background: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.5)", color: "#ff9b9b" } as const;
              return (
                <>
                  <button
                    type="button"
                    className="obs-chip"
                    disabled={!current.html}
                    onClick={handlePush}
                    style={isLive ? liveGreen : offRed}
                    title={isLive
                      ? "On the login page Demos gallery — click to REMOVE"
                      : "Publish and add this build to the login page Demos gallery"}
                  >
                    {isLive ? (
                      <><Check className="h-3.5 w-3.5" /> Live on Demos</>
                    ) : (
                      <><Rocket className="h-3.5 w-3.5" /> Push to Demos</>
                    )}
                  </button>
                  {isLive && (
                    <button
                      type="button"
                      className="obs-chip"
                      disabled={!current.html}
                      onClick={handleUpdate}
                      title="Replace the currently-featured demo with the latest version of this build"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Update Demo
                    </button>
                  )}
                </>
              );
            })()}


            <button
              type="button"
              className="obs-chip"
              onClick={() => { setLibraryOpen(true); refreshLibrary(); }}
              title="Open your personal library — only builds saved under your code appear"
            >
              <FolderOpen className="h-3.5 w-3.5" /> My Library
            </button>
            <button
              type="button"
              className="obs-chip"
              onClick={() => setGithubOpen(true)}
              title="Push this build to a GitHub repo & Pages, or import an existing repo"
            >
              <Github className="h-3.5 w-3.5" /> GitHub
            </button>
            <CreditBar
              mode={entitlement.mode}
              used={Math.max(0, (entitlement.cap ?? 0) - (entitlement.remaining ?? 0))}
              cap={entitlement.cap ?? 0}
              remaining={entitlement.remaining ?? 0}
              cost={current.cost ?? EMPTY_COST}
              onUpgrade={() => setPricingOpen(true)}
            />
            <button
              type="button"
              className={"obs-chip " + (isPro ? "is-on" : "obs-chip-gold")}
              onClick={() => setPricingOpen(true)}
              title={isPro ? "You have Obsidian Pro" : "Upgrade to Pro or buy Save & Host"}
            >
              <CreditCard className="h-3.5 w-3.5" /> {isPro ? "Pro" : "Upgrade"}
            </button>
            <span
              className={
                "obs-chip " +
                (entitlement.mode === "owner" ? "is-on" :
                 entitlement.mode === "pro"   ? "is-on" :
                                                "obs-chip-gold")
              }
              title={
                entitlement.mode === "owner" ? "Site owner — unlimited access, all local features unlocked" :
                entitlement.mode === "pro"   ? `Obsidian Pro · ${entitlement.remaining}/${entitlement.cap} credits left this period` :
                                               "Local Only — manual editing, preview, and export remain free. AI features require Obsidian Pro."
              }
              data-testid="entitlement-pill"
              aria-label={`Access mode: ${modeLabel}`}
            >
              <UserIcon className="h-3.5 w-3.5" /> {modeLabel}
            </span>
            <button
              type="button"
              className="obs-chip"
              onClick={() => setAccountOpen(true)}
              title={authUserId ? (authEmail || "Account") : "Sign in"}
            >
              <UserIcon className="h-3.5 w-3.5" /> {authUserId ? "Account" : "Sign in"}
            </button>
            {authUserId && (
              <button
                type="button"
                className="obs-chip"
                onClick={async () => {
                  try { await supabase.auth.signOut(); } catch { /* ignore */ }
                }}
                title="Sign out of this account"
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5" /> Logout
              </button>
            )}
            {!isMobileViewport && (
              <button
                type="button"
                className={"obs-chip obs-simple-toggle" + (forceSimple ? " is-on" : "")}
                onClick={() => setForceSimple((v) => !v)}
                title={forceSimple ? "Switch back to full desktop view" : "Switch to Simple view — a clean, minimal layout with just the essentials"}
                aria-pressed={forceSimple}
                aria-label="Toggle Simple view"
              >
                <Smartphone className="h-3.5 w-3.5" /> {forceSimple ? "Full view" : "Simple"}
              </button>
            )}


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
                      const clean = sanitizeForExport(current.html);
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
                  <div className="obs-overflow-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="obs-overflow-item"
                    onClick={async () => {
                      setOverflowOpen(false);
                      try { await lockSite(); } catch { /* ignore */ }
                      window.location.assign("/unlock");
                    }}
                    title="Return to the access screen. Your Obsidian account stays signed in."
                  >Lock Workspace</button>
                  <button
                    type="button"
                    role="menuitem"
                    className="obs-overflow-item"
                    data-testid="topbar-signout"
                    onClick={async () => {
                      setOverflowOpen(false);
                      try { await supabase.auth.signOut(); } catch { /* ignore */ }
                      try { await lockSite(); } catch { /* ignore */ }
                      window.location.assign("/unlock");
                    }}
                    title="Sign out of your Obsidian account and lock the workspace."
                  >Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body: canvas + right rail */}
        <div
          className="obs-body"
          style={railCollapsed ? undefined : { gridTemplateColumns: `minmax(0, 1fr) ${railWidth}px` }}
        >
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
                    title="Aetheris Obsidian preview"
                    srcDoc={previewSrcDoc}
                    sandbox="allow-scripts"
                    className="obs-preview"
                    style={isMobile && mobZoom !== 1 ? {
                      transform: `scale(${mobZoom})`,
                      transformOrigin: "top left",
                      width: `${100 / mobZoom}%`,
                      height: `${100 / mobZoom}%`,
                    } : undefined}
                  />
                ) : (
                  <div className="obs-preview-empty">
                    <p>Ask Aetheris Obsidian to build something.</p>
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
            {(error || lastAiError) && (
              <div className="obs-error-card" role="alert" data-testid="ai-error-card">
                <div className="obs-error-card-row">
                  <span className="obs-error-card-label">
                    {lastAiError ? lastAiError.code.replace(/_/g, " ") : "error"}
                  </span>
                  {lastAiError?.requestId && (
                    <span className="obs-error-card-id" title="Request ID">id {lastAiError.requestId.slice(0, 8)}</span>
                  )}
                </div>
                <p className="obs-error-card-msg">{lastAiError?.message ?? error}</p>
                <div className="obs-error-card-actions">
                  {(lastAiError?.retryable ?? true) && (
                    <button
                      type="button"
                      className="obs-btn is-sm"
                      onClick={() => {
                        const last = lastSubmitRef.current;
                        if (!last) return;
                        setError(null); setLastAiError(null);
                        // Restore attachments so retry replays the ORIGINAL request.
                        if (last.attachments.length) setPendingAttachments(last.attachments);
                        void submit(last.prompt);
                      }}
                      data-testid="ai-error-retry"
                    >Retry</button>
                  )}
                  {lastAiError?.requestId && (
                    <button
                      type="button"
                      className="obs-btn is-sm is-ghost"
                      onClick={() => {
                        try { void navigator.clipboard.writeText(lastAiError.requestId); } catch { /* ignore */ }
                      }}
                      data-testid="ai-error-copy-id"
                    >Copy request ID</button>
                  )}
                  <button
                    type="button"
                    className="obs-btn is-sm is-ghost"
                    onClick={() => { setError(null); setLastAiError(null); }}
                  >Dismiss</button>
                </div>
              </div>
            )}
          </div>

          {/* ========== RIGHT RAIL ========== */}
          <aside className="obs-rail">
            <div
              className="obs-rail-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat panel"
              aria-valuenow={railWidth}
              aria-valuemin={railAriaMin}
              aria-valuemax={railAriaMax}
              tabIndex={0}
              title="Drag, or use ← → to resize. Double-click / Home to reset."
              onPointerDown={onRailResizeStart}
              onDoubleClick={resetRailWidth}
              onKeyDown={onRailKeyDown}
            />
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
                  <div
                    key={i}
                    className={m.role === "user" ? "obs-msg is-user" : "obs-msg is-assistant"}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
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
              {(() => {
                const isStarters = !input.trim();
                const IDEA_CATEGORIES: Array<{ id: string; label: string }> = [
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
                  { id: "trades", label: "Trades (optional)" },
                ];
                const baseAddonsAll = suggestAddons(input, !!current.html, ideaOffset, ideaSeed);
                const matchesSet = (a: Addon, set: Set<string>) => {
                  const l = a.label.trim().toLowerCase();
                  const s = a.snippet.trim().toLowerCase();
                  for (const k of set) {
                    if (!k) continue;
                    if (l && (l.includes(k) || k.includes(l))) return true;
                    if (s && (s.includes(k) || k.includes(s.slice(0, 60)))) return true;
                  }
                  return false;
                };
                const isLiveIdea = (a: Addon) => matchesSet(a, liveIdeas);
                const isBuilt = (a: Addon) => matchesSet(a, builtIdeas);
                // Don't hide built/live ideas — show them with a badge so the
                // user can see what's already been made instead of guessing.
                const baseAddons = baseAddonsAll;
                const filteredAi = aiIdeas;
                const addons: Addon[] = isStarters
                  ? (filteredAi.length ? filteredAi.slice(0, 6) : baseAddons)
                  : baseAddons;
                const label = isStarters ? "Try one of these" : "Add to your prompt";
                const IdeaBadge = ({ a }: { a: Addon }) => {
                  if (isLiveIdea(a)) return <span title="You already built this and pushed it live" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: "rgba(34,197,94,0.18)", color: "#7ee2a4", border: "1px solid rgba(34,197,94,0.45)", letterSpacing: 0.3 }}>LIVE</span>;
                  if (isBuilt(a)) return <span title="You already built this" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: "rgba(244,161,37,0.15)", color: "#F4A125", border: "1px solid rgba(244,161,37,0.45)", letterSpacing: 0.3 }}>BUILT</span>;
                  return null;
                };
                const savedKey = (a: Addon) => a.snippet.trim().toLowerCase();
                const savedSet = new Set(savedIdeas.map(savedKey));
                const toggleSave = (a: Addon) => {
                  const key = savedKey(a);
                  setSavedIdeas((prev) =>
                    prev.some((p) => savedKey(p) === key)
                      ? prev.filter((p) => savedKey(p) !== key)
                      : [{ ...a, id: "saved-" + Date.now().toString(36) }, ...prev].slice(0, 40)
                  );
                };
                const fetchCategoryIdeas = async (category: string, replace: boolean) => {
                  if (aiIdeasLoading) return;
                  setAiIdeasLoading(true);
                  try {
                    const exclude = Array.from(new Set([
                      ...Array.from(seenIdeaLabelsRef.current),
                      ...Array.from(builtIdeas),
                    ])).slice(-120);
                    const res = await generateStarterIdeasFn({ data: { exclude, count: 8, category: category as never } });
                    const fresh = (res.ideas ?? []).map((i) => ({ id: i.id, label: i.label, snippet: i.snippet } as Addon));
                    fresh.forEach((f) => seenIdeaLabelsRef.current.add(f.label.toLowerCase()));
                    setAiIdeas((prev) => {
                      const next = replace ? fresh : [...fresh, ...prev];
                      const seen = new Set<string>();
                      return next.filter((a) => {
                        const k = a.label.toLowerCase();
                        if (seen.has(k)) return false;
                        seen.add(k);
                        return true;
                      }).slice(0, 12);
                    });
                  } catch {
                    // silent
                  } finally {
                    setAiIdeasLoading(false);
                  }
                };
                const cycleIdeas = () => {
                  setIdeaOffset((o) => (o + 4) % Math.max(1, STARTER_IDEA_COUNT));
                  fetchCategoryIdeas(ideaCategory, true);
                };
                const dismissIdea = (a: Addon) => {
                  recordBuiltIdea(a.label);
                  recordBuiltIdea(a.snippet.slice(0, 60));
                  setAiIdeas((prev) => prev.filter((p) => p.id !== a.id && p.label !== a.label));
                  // Keep the rail fresh forever — refill as soon as it thins out.
                  const remaining = addons.filter((p) => p.id !== a.id && p.label !== a.label).length;
                  if (remaining < 4 && !aiIdeasLoading) {
                    fetchCategoryIdeas(ideaCategory, false);
                  }
                };
                const pickCategory = (cat: string) => {
                  setIdeaCategory(cat);
                  setAiIdeas([]);
                  fetchCategoryIdeas(cat, true);
                };
                return (
                  <>
                    {isStarters && (
                      <div
                        className="obs-idea-cats"
                        style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}
                        role="tablist"
                        aria-label="Idea categories"
                      >
                        {IDEA_CATEGORIES.map((c) => {
                          const active = ideaCategory === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => pickCategory(c.id)}
                              disabled={aiIdeasLoading && active}
                              className="obs-idea-cat"
                              style={{
                                fontSize: 10,
                                padding: "3px 8px",
                                borderRadius: 999,
                                border: active
                                  ? "1px solid rgba(244,161,37,0.65)"
                                  : "1px solid rgba(255,255,255,0.08)",
                                background: active
                                  ? "rgba(244,161,37,0.14)"
                                  : "rgba(255,255,255,0.03)",
                                color: active ? "var(--obs-gold, #F4A125)" : "inherit",
                                cursor: "pointer",
                                lineHeight: 1.4,
                              }}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {isStarters && savedIdeas.length > 0 && (
                      <>
                        <div className="obs-suggestions-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <BookmarkCheck className="h-3 w-3" style={{ color: "var(--obs-gold, #F4A125)" }} />
                            Saved ideas
                          </span>
                          <span style={{ opacity: 0.55, fontSize: 10 }}>click to build</span>
                        </div>
                        <div className="obs-suggestions" style={{ marginBottom: 8 }}>
                          {savedIdeas.map((a) => (
                            <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              <button
                                type="button"
                                className="obs-suggestion obs-idea-in"
                                onClick={() => appendAddon(a)}
                                disabled={loading}
                                title={a.snippet}
                                style={{ borderColor: "rgba(244,161,37,0.35)" }}
                              >
                                <span>{a.label}</span>
                                <IdeaBadge a={a} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSave(a)}
                                title="Remove from saved"
                                aria-label={`Remove ${a.label} from saved`}
                                style={{ background: "transparent", border: 0, cursor: "pointer", padding: 2, opacity: 0.6 }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="obs-suggestions-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span>{label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isStarters && (
                          <button
                            type="button"
                            onClick={cycleIdeas}
                            className="obs-icon-btn"
                            title="Generate fresh ideas with AI"
                            aria-label="Generate fresh ideas with AI"
                            disabled={aiIdeasLoading}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, opacity: aiIdeasLoading ? 0.5 : 0.85 }}
                          >
                            {aiIdeasLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            <span>{aiIdeasLoading ? "Thinking…" : "New ideas"}</span>
                          </button>
                        )}
                        <span style={{ opacity: 0.55, fontSize: 10 }}>click to {isStarters ? "build" : "append"} · free</span>
                      </div>
                    </div>
                    <div className="obs-suggestions">
                      {addons.map((a) => {
                        const isSaved = savedSet.has(savedKey(a));
                        return (
                          <span key={a.id + ":" + ideaOffset} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            <button
                              type="button"
                              className="obs-suggestion obs-idea-in"
                              onClick={() => appendAddon(a)}
                              disabled={loading}
                              title={a.snippet}
                            >
                              <span>{a.label}</span>
                              <IdeaBadge a={a} />
                            </button>
                            {isStarters && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => expandIdea(a)}
                                  disabled={expandingIdeaId !== null}
                                  title="Expand: keep growing this idea into a fuller prompt"
                                  aria-label={`Expand ${a.label}`}
                                  style={{
                                    background: "transparent",
                                    border: 0,
                                    cursor: expandingIdeaId ? "wait" : "pointer",
                                    padding: 2,
                                    opacity: expandingIdeaId === a.id ? 1 : 0.6,
                                    color: "var(--obs-gold, #F4A125)",
                                  }}
                                >
                                  {expandingIdeaId === a.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Sparkles className="h-3 w-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleSave(a)}
                                  title={isSaved ? "Remove from saved" : "Save this idea"}
                                  aria-label={isSaved ? `Unsave ${a.label}` : `Save ${a.label}`}
                                  style={{
                                    background: "transparent",
                                    border: 0,
                                    cursor: "pointer",
                                    padding: 2,
                                    opacity: isSaved ? 1 : 0.55,
                                    color: isSaved ? "var(--obs-gold, #F4A125)" : "inherit",
                                  }}
                                >
                                  {isSaved ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissIdea(a)}
                                  title="Don't show this again"
                                  aria-label={`Dismiss ${a.label}`}
                                  style={{
                                    background: "transparent",
                                    border: 0,
                                    cursor: "pointer",
                                    padding: 2,
                                    opacity: 0.45,
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {!isStarters && (nextStepsLoading || nextSteps.length > 0) && (
                      <>
                        <div className="obs-suggestions-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Sparkles className="h-3 w-3" style={{ color: "var(--obs-gold, #F4A125)" }} />
                            Suggested next
                          </span>
                          <span style={{ opacity: 0.55, fontSize: 10 }}>
                            {nextStepsLoading ? "reading your prompt…" : "click to append"}
                          </span>
                        </div>
                        <div className="obs-suggestions">
                          {nextSteps.map((a) => (
                            <button
                              key={"next:" + a.id}
                              type="button"
                              className="obs-suggestion obs-idea-in"
                              onClick={() => appendAddon(a)}
                              disabled={loading}
                              title={a.snippet}
                              style={{ borderColor: "rgba(244,161,37,0.35)" }}
                            >
                              <span>{a.label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
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
                ref={composerFormRef}
                className={"obs-composer" + (composerPos ? " is-floating" : "")}
                style={composerPos ? {
                  position: "fixed",
                  left: composerPos.x,
                  top: composerPos.y,
                  zIndex: 9999,
                  width: 420,
                  maxWidth: "calc(100vw - 16px)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,161,37,0.35)",
                  borderRadius: 12,
                  background: "#111317",
                  padding: 8,
                } : undefined}
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label={composerPos ? "Drag prompt (double-click to dock)" : "Drag prompt anywhere"}
                  title={composerPos ? "Drag to move · double-click to dock back" : "Drag to detach and move anywhere"}
                  onPointerDown={onComposerDragStart}
                  onDoubleClick={() => setComposerPos(null)}
                  style={{ cursor: "grab", touchAction: "none" }}
                >
                  {composerPos ? <Pin className="h-3.5 w-3.5" /> : <GripVertical className="h-3.5 w-3.5" />}
                </button>
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
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label="Screenshot"
                  title="Screenshot — capture the screen and attach"
                  disabled={loading}
                  onClick={() => setCaptureMode("full")}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label="Snip a region"
                  title="Snip — drag to select a region, copy or attach"
                  disabled={loading}
                  onClick={() => setCaptureMode("snip")}
                >
                  <Scissors className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label="Enhance prompt"
                  title="Enhance prompt — rewrite for clarity and specifics"
                  disabled={loading || enhancing || !input.trim()}
                  onClick={handleEnhance}
                >
                  {enhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label={current.mode === "plan" ? "Plan mode on — click to exit" : "Plan first"}
                  title={current.mode === "plan"
                    ? "Plan mode ON — the AI will dialogue and outline the architecture before any code is generated. Click to switch back to Agent."
                    : "Plan first — dialogue the build with the AI (architecture outline, no code) before generating"}
                  disabled={loading}
                  onClick={() => updateCurrent({ mode: current.mode === "plan" ? "agent" : "plan" })}
                  style={current.mode === "plan" ? { background: "rgba(244,161,37,0.18)", color: "#f4a125" } : undefined}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label="Expand idea"
                  title="Expand idea — grow the current prompt with the next best addition (press again for more)"
                  disabled={loading || expandingDraft || !input.trim()}
                  onClick={expandDraft}
                >
                  {expandingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                </button>
                <div
                  className="obs-composer-input-wrap"
                  style={{
                    height: composerHeight,
                    width: composerWidth ?? "100%",
                    minHeight: 40,
                    maxHeight: 800,
                    minWidth: 240,
                    maxWidth: "100%",
                  }}
                >
                  <textarea
                    ref={composerRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!loading) submit();
                      }
                    }}
                    placeholder={pendingAttachments.length ? "Describe how to use the attached materials…  (Enter to send, Shift+Enter for newline)" : "Ask Aetheris Obsidian…  (Enter to send, Shift+Enter for newline)"}
                    rows={1}
                    className="obs-composer-input"
                    data-testid="composer-input"
                  />
                  {(["n","s","e","w","ne","nw","se","sw"] as const).map((dir) => (
                    <div
                      key={dir}
                      className={`obs-composer-resize obs-composer-resize-${dir}`}
                      role="separator"
                      aria-label={`Resize ${dir}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        const wrap = (e.currentTarget.parentElement as HTMLElement);
                        const rect = wrap.getBoundingClientRect();
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startW = rect.width;
                        const startH = rect.height;
                        const parentW = (wrap.parentElement?.getBoundingClientRect().width) ?? startW;
                        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
                        const onMove = (ev: PointerEvent) => {
                          const dx = ev.clientX - startX;
                          const dy = ev.clientY - startY;
                          let w = startW;
                          let h = startH;
                          if (dir.includes("e")) w = startW + dx;
                          if (dir.includes("w")) w = startW - dx;
                          if (dir.includes("s")) h = startH + dy;
                          if (dir.includes("n")) h = startH - dy;
                          w = clamp(w, 240, parentW);
                          h = clamp(h, 40, 800);
                          setComposerWidth(Math.round(w));
                          setComposerHeight(Math.round(h));
                        };
                        const onUp = () => {
                          window.removeEventListener("pointermove", onMove);
                          window.removeEventListener("pointerup", onUp);
                          document.body.classList.remove("is-resizing-composer");
                        };
                        document.body.classList.add("is-resizing-composer");
                        window.addEventListener("pointermove", onMove);
                        window.addEventListener("pointerup", onUp);
                      }}
                      onDoubleClick={() => {
                        setComposerHeight(72);
                        setComposerWidth(null);
                      }}
                    />
                  ))}
                </div>


                {loading ? (
                  <>
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      aria-label="Queue next build"
                      title="Queue this prompt — runs when the current build finishes"
                      className="obs-composer-send"
                      style={{ background: "var(--gold, #f4a125)", color: "#111317" }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={stopGeneration}
                      aria-label="Stop"
                      className="obs-composer-send"
                      title="Stop current build"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  </>
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

            {/* Core 4.0 — Adaptive Intelligence */}
            <IntelligencePanel refreshKey={intelligenceTick} intent={lastIntent} decision={lastDecision} lastOperation={lastOperation} />
            <EngineeringConsolePanel
              live={engineeringLive}
              report={engineeringReport}
              running={engineeringRunning}
              bypass={engineeringBypass}
              onToggleBypass={setEngineeringBypass}
              currentStage={stage ?? undefined}
            />
            <StrategyExplanation decision={lastDecision} lastOperation={lastOperation} />
            <LearningPanel onChange={() => setIntelligenceTick((n) => n + 1)} />

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
                { label: "Combine projects (Fusion)…", run: () => { setPaletteOpen(false); setFusionOpen(true); } },
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
                  <span>Send to Aetheris Obsidian: “{paletteQuery.trim().slice(0, 60)}”</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <GithubModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        currentHtml={current?.html || ""}
        defaultRepoName={(current?.title || "obsidian-build").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "obsidian-build"}
        onImport={(html) => updateCurrent({ html })}
        onLog={(line) => setTerminal((t) => [...t, line])}
      />
      {pricingOpen && <PricingModal onClose={() => { setPricingOpen(false); setPricingInitialPrice(undefined); }} initialPriceId={pricingInitialPrice} />}
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
      <BuildChatPanel
        open={buildChatOpen}
        onClose={() => setBuildChatOpen(false)}
        currentHtml={current.html || ""}
        draftPrompt={input}
        onInsertToPrompt={(text) => {
          setInput((prev) => {
            const base = prev.trim();
            if (!base) return text;
            return base.endsWith(".") ? `${base} ${text}` : `${base}. ${text}`;
          });
          requestAnimationFrame(() => composerRef.current?.focus());
        }}
        onApplyAndRebuild={(prompt) => {
          setInput(prompt);
          requestAnimationFrame(() => { void submit(prompt); });
        }}
      />
      <FusionModal
        open={fusionOpen}
        projects={sessions.map((s) => ({ id: s.id, title: s.title || "Untitled", html: s.html || "" }))}
        onClose={() => setFusionOpen(false)}
        onCommit={commitFusion}
      />
      {captureMode && (
        <ScreenCaptureModal
          mode={captureMode}
          onClose={() => setCaptureMode(null)}
          onAttach={(dataUrl, name) => {
            setPendingAttachments((a) => [...a, { kind: "image", name, dataUrl }]);
            setCaptureMode(null);
          }}
        />
      )}
      {libraryOpen && (

        <div
          role="dialog"
          aria-modal="true"
          aria-label="My Library"
          onClick={() => setLibraryOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "grid", placeItems: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(760px, 100%)", maxHeight: "84vh", overflow: "auto", background: "#111317", color: "#f2eee7", border: "1px solid #22262d", borderRadius: 12, padding: 20, fontFamily: "Inter, system-ui" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={{ fontFamily: "Fraunces, Georgia, serif", color: "#F4A125", margin: 0, fontSize: 20 }}>My Library</h2>
              <button type="button" onClick={() => setLibraryOpen(false)} style={{ background: "transparent", color: "#B6BCC8", border: "1px solid #22262d", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Close</button>
            </div>
            <p style={{ color: "#B6BCC8", fontSize: 12, marginTop: 4 }}>
              Enter a private library code (4-64 chars). Everything you build and every Go Live is saved under this code. Use the same code across browsers or devices to see your library anywhere. Others cannot see your builds unless you share your code or a Go Live URL.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={libraryCode}
                onChange={(e) => setLibraryCode(e.target.value.replace(/\s+/g, ""))}
                placeholder="your-library-code"
                style={{ flex: 1, padding: "10px 12px", background: "#0b0d10", color: "#f2eee7", border: "1px solid #22262d", borderRadius: 8, fontFamily: "inherit" }}
              />
              <button type="button" onClick={refreshLibrary} style={{ padding: "10px 14px", background: "#F4A125", color: "#111317", border: 0, borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>Load</button>
            </div>
            {!libraryCode.trim() ? (
              <p style={{ color: "#8a919b", fontSize: 12, marginTop: 12 }}>Enter a code to see your saved builds.</p>
            ) : libraryBuilds.length === 0 ? (
              <p style={{ color: "#8a919b", fontSize: 12, marginTop: 12 }}>No builds under this code yet. Build something and hit Go Live.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
                {libraryBuilds.map((b) => {
                  const url = `${window.location.origin}/api/public/share/${b.share_slug}`;
                  return (
                    <li key={b.id} style={{ border: "1px solid #22262d", borderRadius: 10, padding: 12, background: "#0f1216" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: "#F4A125", fontFamily: "Fraunces, Georgia, serif", fontSize: 15, textDecoration: "none" }}>{b.title}</a>
                        <span style={{ color: "#8a919b", fontSize: 11 }}>{new Date(b.created_at).toLocaleString()} · {(b.byte_size / 1024).toFixed(1)} KB</span>
                      </div>
                      {b.prompt && <div style={{ color: "#B6BCC8", fontSize: 12, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{b.prompt}</div>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => openLibraryBuild(b.id, { duplicate: false })}
                          style={{ background: "#F4A125", color: "#111317", border: 0, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >Open in editor</button>
                        <button
                          type="button"
                          onClick={() => openLibraryBuild(b.id, { duplicate: true })}
                          style={{ background: "transparent", color: "#F4A125", border: "1px solid #F4A125", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
                        >Duplicate as new tab</button>
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard?.writeText(url); setTerminal((t) => [...t, `✓ Copied ${url}`]); }}
                          style={{ background: "transparent", color: "#B6BCC8", border: "1px solid #22262d", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
                        >Copy public URL</button>
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: "#B6BCC8", border: "1px solid #22262d", borderRadius: 6, padding: "4px 10px", textDecoration: "none", fontSize: 12 }}>Preview live</a>
                      </div>

                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      {isMobile && (
        <nav className="mob-bottom-nav" role="tablist" aria-label="Mobile workspace">
          {([
            { id: "chat", label: "Chat", Icon: Bot },
            { id: "preview", label: "Preview", Icon: Eye },
            { id: "files", label: "Files", Icon: Files },
            { id: "build", label: "Build", Icon: Rocket },
            { id: "more", label: "More", Icon: MoreHorizontal },
          ] as const).map((t) => {
            const Icon = t.Icon;
            const isOn = mobileTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isOn}
                aria-current={isOn ? "page" : undefined}
                className={"mob-tab" + (isOn ? " is-on" : "")}
                onClick={() => setMobileTab(t.id)}
              >
                <Icon className="h-5 w-5" strokeWidth={1.6} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </main>

  );
}
