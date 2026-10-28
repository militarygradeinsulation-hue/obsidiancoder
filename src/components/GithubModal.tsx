import * as React from "react";
import { Github, Loader2, ExternalLink, Rocket, Download, Check, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { requirePaidAction, type GuardOperation } from "@/lib/action-guard";
import { applyAppEditPlan, parseAppEditPlan, type AppEditPlan } from "@/lib/full-app-edits";
import {
  FULL_APP_INTEGRATIONS,
  type FullAppIntegrationId,
} from "@/lib/full-app-integrations";

type GhUser = { login: string; avatar_url: string; name?: string };
type Repo = {
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  updated_at: string;
  default_branch: string;
};

type DeployResult = {
  repo: { html_url: string; full_name: string; name: string };
  pages: { html_url: string; alreadyEnabled: boolean } | null;
  mode?: "static" | "full-app";
};

const TOKEN_KEY = "obs.gh.token";

const GH_ACTION_GUARDS: Record<string, GuardOperation> = {
  verify:    "github_verify",
  listRepos: "github_list",
  import:    "github_import",
  deploy:    "github_deploy",
  buildStatus: "github_list",
  buildDiagnostics: "github_list",
  triggerBuild: "github_deploy",
  triggerHealth: "github_deploy",
  triggerBackendHealth: "github_deploy",
  syncFullApp: "github_deploy",
  configureAppBackend: "github_deploy",
  publishApp: "github_deploy",
  shipApp: "github_deploy",
  setCustomDomain: "github_deploy",
  customDomainStatus: "github_list",
  rollbackApp: "github_deploy",
  backendStatus: "github_list",
  deployBackend: "github_deploy",
  provisionBackend: "github_deploy",
  connectSupabaseBackend: "github_deploy",
  setSupabaseSecret: "github_deploy",
  deleteSupabaseSecret: "github_deploy",
  setIntegrationVariable: "github_deploy",
  configureSupabaseAuth: "github_deploy",
  connectSupabaseBackend: "github_deploy",
  setSupabaseSecret: "github_deploy",
  deleteSupabaseSecret: "github_deploy",
  setIntegrationVariable: "github_deploy",
};

async function ghCall<T = unknown>(body: unknown): Promise<T> {
  // Central client-side guard — free users can't reach any GitHub route.
  const action = typeof body === "object" && body ? (body as { action?: string }).action : undefined;
  const op = action ? GH_ACTION_GUARDS[action] : undefined;
  if (op) {
    const gate = await requirePaidAction(op);
    if (!gate.allowed) throw new Error("Sign in and activate Obsidian Pro to use GitHub.");
  }
  const r = await authFetch("/api/github", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as { error?: string } & T;
  if (!r.ok || (j as { error?: string }).error) {
    throw new Error((j as { error?: string }).error || `Request failed (${r.status}).`);
  }
  return j;
}

export function GithubModal(props: {
  open: boolean;
  onClose: () => void;
  currentHtml: string;
  defaultRepoName: string;
  onImport: (html: string) => void;
  onLog: (line: string) => void;
  fullAppFiles?: Record<string, string>;
  defaultDeployMode?: "static" | "full-app";
  fullAppAddons?: string[];
  requiredIntegrations?: FullAppIntegrationId[];
  onRepairDiagnostics?: (context: string) => void | Promise<void>;
  onApplyFullAppFiles?: (files: Record<string, string>, message: string) => void;
  defaultManagedRepo?: string;
  defaultSupabaseProjectRef?: string;
  defaultDeploymentUrl?: string;
  onProductionUpdate?: (patch: {
    githubRepo?: string;
    lastBuildRunId?: number;
    lastBuildConclusion?: string | null;
    lastShipRunId?: number;
    lastShipConclusion?: string | null;
    lastHealthRunId?: number;
    lastHealthConclusion?: string | null;
    lastBackendHealthRunId?: number;
    lastBackendHealthConclusion?: string | null;
    deploymentUrl?: string;
    customDomain?: string;
    customDomainHealthy?: boolean;
    customDomainHttps?: boolean;
    supabaseProjectRef?: string;
    authSiteUrl?: string;
    lastCheckedAt?: number;
  }) => void;
}) {
  const {
    open, onClose, currentHtml, defaultRepoName, onImport, onLog,
    fullAppFiles, fullAppAddons, requiredIntegrations = [], onRepairDiagnostics, onApplyFullAppFiles,
    defaultManagedRepo, defaultSupabaseProjectRef, defaultDeploymentUrl, onProductionUpdate, defaultDeployMode = "static",
  } = props;
  const [token, setToken] = React.useState("");
  const [user, setUser] = React.useState<GhUser | null>(null);
  const [repos, setRepos] = React.useState<Repo[]>([]);
  const [loading, setLoading] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [repoName, setRepoName] = React.useState(defaultRepoName);
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [enablePages, setEnablePages] = React.useState(true);
  const [deployMode, setDeployMode] = React.useState<"static" | "full-app">(defaultDeployMode);
  const [result, setResult] = React.useState<DeployResult | null>(null);
  const [managedRepo, setManagedRepo] = React.useState("");
  const [appUrl, setAppUrl] = React.useState("");
  const [appPublishableKey, setAppPublishableKey] = React.useState("");
  const [supabaseAccessToken, setSupabaseAccessToken] = React.useState("");
  const [supabaseProjectRef, setSupabaseProjectRef] = React.useState("");
  const [supabaseConnection, setSupabaseConnection] = React.useState<null | {
    projectName: string;
    projectStatus: string;
    keyKind: string;
    secretNames: string[];
  }>(null);
  const [secretDrafts, setSecretDrafts] = React.useState<Record<string, string>>({});
  const [variableDrafts, setVariableDrafts] = React.useState<Record<string, string>>({});
  type ManagedRun = { id: number; status: string; conclusion: string | null; url: string; created_at: string; head_sha?: string };
  const [builds, setBuilds] = React.useState<ManagedRun[]>([]);
  const [publishes, setPublishes] = React.useState<ManagedRun[]>([]);
  const [ships, setShips] = React.useState<ManagedRun[]>([]);
  const [health, setHealth] = React.useState<ManagedRun[]>([]);
  const [hostingUrl, setHostingUrl] = React.useState("");
  const [customDomainInput, setCustomDomainInput] = React.useState("");
  const [domainStatus, setDomainStatus] = React.useState<null | {
    url: string;
    domain: string;
    httpsEnforced: boolean;
    status: string;
    healthPending: boolean;
    health: unknown;
  }>(null);
  const [backendMode, setBackendMode] = React.useState<"functions-only" | "schema-and-functions">("functions-only");
  const [backendReady, setBackendReady] = React.useState<null | {
    hasAccessToken: boolean;
    hasDbPassword: boolean;
    hasProjectRef: boolean;
    hasOrgId?: boolean;
    hasPublicUrl: boolean;
    hasPublicKey: boolean;
    missingIntegrationSecrets?: string[];
    missingIntegrationVariables?: string[];
    supabaseSecretsVerified?: boolean;
    integrations?: Array<{
      id: FullAppIntegrationId;
      label: string;
      purpose: string;
      ready: boolean;
      requiredSecrets: string[];
      requiredVariables: string[];
      missingSecrets: string[];
      missingVariables: string[];
    }>;
  }>(null);
  const [backendRuns, setBackendRuns] = React.useState<typeof builds>([]);
  const [backendHealthRuns, setBackendHealthRuns] = React.useState<typeof builds>([]);
  const backendDeployReady = !!backendReady &&
    backendReady.hasAccessToken &&
    backendReady.hasProjectRef &&
    backendReady.hasPublicUrl &&
    backendReady.hasPublicKey &&
    (backendMode === "functions-only" || backendReady.hasDbPassword) &&
    (requiredIntegrations.length === 0 || backendReady.supabaseSecretsVerified === true) &&
    (backendReady.missingIntegrationSecrets?.length ?? 0) === 0 &&
    (backendReady.missingIntegrationVariables?.length ?? 0) === 0;

  React.useEffect(() => {
    if (!open) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : "";
    if (stored) setToken(stored);
    setRepoName(defaultRepoName);
    setDeployMode(defaultDeployMode);
    setManagedRepo(defaultManagedRepo ?? "");
    setSupabaseProjectRef(defaultSupabaseProjectRef ?? "");
    setHostingUrl(defaultDeploymentUrl ?? "");
    setResult(null);
    setErr(null);
  }, [open, defaultRepoName, defaultManagedRepo, defaultSupabaseProjectRef, defaultDeploymentUrl, defaultDeployMode]);

  React.useEffect(() => {
    if (!open || !token || user) return;
    // Auto-verify a stored token silently.
    void connect(token, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function connect(t: string, silent = false) {
    setErr(null);
    setLoading("verify");
    try {
      const { user, repos } = await ghCall<{ user: GhUser; repos: Repo[] }>({
        action: "listRepos",
        token: t,
      });
      setUser(user);
      setRepos(repos);
      localStorage.setItem(TOKEN_KEY, t);
      if (!silent) onLog(`✓ Connected to GitHub as @${user.login}`);

      if (defaultManagedRepo) {
        try {
          const production = await ghCall<{
            ok: boolean;
            builds?: ManagedRun[];
            publishes?: ManagedRun[];
            ships?: ManagedRun[];
            health?: ManagedRun[];
          }>({
            action: "buildStatus",
            token: t,
            repo: defaultManagedRepo,
          });
          const nextBuilds = production.builds ?? [];
          const nextPublishes = production.publishes ?? [];
          const nextShips = production.ships ?? [];
          const nextHealth = production.health ?? [];
          setBuilds(nextBuilds);
          setPublishes(nextPublishes);
          setShips(nextShips);
          setHealth(nextHealth);
          onProductionUpdate?.({
            githubRepo: defaultManagedRepo,
            lastBuildRunId: nextBuilds[0]?.id,
            lastBuildConclusion: nextBuilds[0]?.conclusion ?? nextBuilds[0]?.status ?? null,
            lastShipRunId: nextShips[0]?.id,
            lastShipConclusion: nextShips[0]?.conclusion ?? nextShips[0]?.status ?? null,
            lastHealthRunId: nextHealth[0]?.id,
            lastHealthConclusion: nextHealth[0]?.conclusion ?? nextHealth[0]?.status ?? null,
            lastCheckedAt: Date.now(),
          });
        } catch {
          // Restoring GitHub status is best-effort; connection itself succeeded.
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "connect failed";
      setErr(msg);
      if (!silent) onLog(`✗ GitHub: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  async function deploy() {
    if (!currentHtml.trim()) {
      setErr("Build something first, then deploy.");
      return;
    }
    setErr(null);
    setLoading("deploy");
    setResult(null);
    try {
      const res = await ghCall<DeployResult>({
        action: "deploy",
        token,
        repo: repoName || defaultRepoName,
        html: currentHtml,
        title: repoName || defaultRepoName,
        enablePages: deployMode === "static" && enablePages,
        isPrivate,
        mode: deployMode,
        ...(deployMode === "full-app" && fullAppFiles ? { files: fullAppFiles } : {}),
        ...(deployMode === "full-app" && fullAppAddons ? { addons: fullAppAddons } : {}),
      });
      setResult(res);
      if (res.mode === "full-app") {
        setManagedRepo(res.repo.name);
        onProductionUpdate?.({ githubRepo: res.repo.name });
      }
      onLog(`✓ Pushed to ${res.repo.full_name}`);
      if (res.pages) onLog(`  Pages: ${res.pages.html_url}`);
      if (deployMode === "full-app") onLog("✓ Full App starter created: configure Supabase and deploy through a build-capable host.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "deploy failed";
      setErr(msg);
      onLog(`✗ Deploy: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  function repairPromptFromDiagnostics(d: {
    runId: number;
    workflow: string;
    status: string;
    conclusion: string | null;
    headSha: string;
    failedSteps: string[];
    diagnostics: string[];
  }, fallbackHead?: string) {
    return [
      "Repair this Full App using the verified Obsidian Build Engine diagnostics below.",
      "Do not redesign unrelated areas. Preserve working behavior, auth, database ownership rules, and existing features.",
      "Fix the smallest set of source files needed for the build and browser QA to pass.",
      "Do not edit protected framework/workflow files. Do not weaken security checks to make tests pass.",
      "",
      "WORKFLOW: " + d.workflow,
      "RUN: " + String(d.runId),
      "REVISION: " + (d.headSha || fallbackHead || "unknown"),
      "CONCLUSION: " + (d.conclusion || d.status),
      "",
      "FAILED STEPS:",
      ...(d.failedSteps.length ? d.failedSteps.map(step => "- " + step) : ["- Build/QA failure; exact failed step unavailable."]),
      "",
      "DIAGNOSTICS:",
      ...(d.diagnostics.length ? d.diagnostics.map(line => "- " + line) : ["- No bounded error excerpt was available. Inspect likely compile/runtime issues in current source."]),
    ].join("\n").slice(0, 12_000);
  }

  function buildRepairSourceContext(files: Record<string, string>, repairPrompt: string) {
    const entries = Object.entries(files);
    const referenced = entries.filter(([path]) => repairPrompt.includes(path));
    const rest = entries.filter(([path]) => !repairPrompt.includes(path));
    const ordered = [...referenced, ...rest];
    const context: Record<string, string> = {};
    let used = 0;
    for (const [filePath, source] of ordered) {
      if (Object.keys(context).length >= 20 || used + filePath.length + source.length > 45_000) continue;
      context[filePath] = source;
      used += filePath.length + source.length;
    }
    return context;
  }

  async function fetchRunDiagnostics(run: ManagedRun) {
    return ghCall<{
      ok: boolean;
      diagnostics: {
        runId: number;
        workflow: string;
        status: string;
        conclusion: string | null;
        headSha: string;
        url: string;
        failedSteps: string[];
        diagnostics: string[];
      };
    }>({
      action: "buildDiagnostics",
      token,
      repo: managedRepo.trim(),
      runId: run.id,
    });
  }

  async function autoRepairRun(run: ManagedRun) {
    if (!managedRepo.trim() || !fullAppFiles || !onApplyFullAppFiles) return;
    if (!window.confirm(
      "Run one bounded auto-repair cycle? Obsidian will use AI credits once, apply the targeted repair to this Full App, sync it to GitHub, and queue Build + QA again."
    )) return;
    setErr(null);
    setLoading("auto-repair:" + run.id);
    try {
      const diagnosticResult = await fetchRunDiagnostics(run);
      const d = diagnosticResult.diagnostics;
      const repairPrompt = repairPromptFromDiagnostics(d, run.head_sha);
      const sourceContext = buildRepairSourceContext(fullAppFiles, repairPrompt);
      if (!Object.keys(sourceContext).length) throw new Error("No editable Full App source was available for repair.");

      const editResponse = await authFetch("/api/full-app/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: repairPrompt,
          task: "edit",
          files: sourceContext,
        }),
      });
      const editResult = await editResponse.json() as { ok?: boolean; plan?: AppEditPlan; error?: string };
      if (!editResponse.ok || !editResult.ok || !editResult.plan) {
        throw new Error(editResult.error ?? "The repair agent did not return a valid edit plan.");
      }
      const plan = parseAppEditPlan(editResult.plan);
      const repairedFiles = applyAppEditPlan(fullAppFiles, plan);

      const syncResult = await ghCall<{
        ok: boolean;
        status: string;
        headSha?: string;
        message?: string;
      }>({
        action: "syncFullApp",
        token,
        repo: managedRepo.trim(),
        html: currentHtml,
        title: defaultRepoName,
        files: repairedFiles,
        addons: fullAppAddons ?? [],
        ...(d.headSha ? { expectedHeadSha: d.headSha } : {}),
      });

      onApplyFullAppFiles(repairedFiles, "Auto-repair applied and synced. Build + QA is running again.");
      onProductionUpdate?.({ githubRepo: managedRepo.trim(), lastCheckedAt: Date.now() });
      setBuilds([]);
      setShips([]);
      setPublishes([]);
      onLog(syncResult.message ?? "Auto-repair synced. Build + QA queued.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Auto-repair failed";
      setErr(message);
      onLog("Auto-repair: " + message);
    } finally {
      setLoading(null);
    }
  }

  async function diagnoseRun(run: ManagedRun) {
    if (!managedRepo.trim() || !onRepairDiagnostics) return;
    setErr(null);
    setLoading("diagnostics:" + run.id);
    try {
      const result = await ghCall<{
        ok: boolean;
        diagnostics: {
          runId: number;
          workflow: string;
          status: string;
          conclusion: string | null;
          headSha: string;
          url: string;
          failedSteps: string[];
          diagnostics: string[];
        };
      }>({
        action: "buildDiagnostics",
        token,
        repo: managedRepo.trim(),
        runId: run.id,
      });
      const d = result.diagnostics;
      await onRepairDiagnostics(repairPromptFromDiagnostics(d, run.head_sha));
      onLog("Build diagnostics loaded into the Full App repair agent.");
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not read build diagnostics";
      setErr(message);
      onLog("Build diagnostics: " + message);
    } finally {
      setLoading(null);
    }
  }

  async function connectSupabaseProject() {
    if (!managedRepo.trim()) { setErr("Select the Full App repository first."); return; }
    if (!supabaseAccessToken.trim() || !/^[a-z0-9]{20}$/.test(supabaseProjectRef.trim())) {
      setErr("Enter a scoped Supabase management token and a 20-character project ref.");
      return;
    }
    setErr(null);
    setLoading("connect-supabase");
    try {
      const result = await ghCall<{
        ok: boolean;
        backend: {
          projectRef: string;
          projectName: string;
          projectStatus: string;
          publicUrl: string;
          keyKind: string;
          secretNames: string[];
        };
        message?: string;
      }>({
        action: "connectSupabaseBackend",
        token,
        repo: managedRepo.trim(),
        supabaseAccessToken: supabaseAccessToken.trim(),
        projectRef: supabaseProjectRef.trim(),
      });
      setSupabaseProjectRef(result.backend.projectRef);
      setSupabaseConnection({
        projectName: result.backend.projectName,
        projectStatus: result.backend.projectStatus,
        keyKind: result.backend.keyKind,
        secretNames: result.backend.secretNames,
      });
      setAppUrl(result.backend.publicUrl);
      setBackendReady(null);
      onProductionUpdate?.({
        githubRepo: managedRepo.trim(),
        supabaseProjectRef: result.backend.projectRef,
        lastCheckedAt: Date.now(),
      });
      onLog(result.message ?? "Supabase project connected.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not connect Supabase project";
      setErr(message);
      onLog("Supabase: " + message);
    } finally {
      setLoading(null);
    }
  }

  async function saveRuntimeSecret(integration: FullAppIntegrationId, name: string) {
    const value = secretDrafts[name]?.trim() ?? "";
    if (!value || !supabaseAccessToken.trim() || !supabaseProjectRef.trim()) return;
    setErr(null);
    setLoading("secret:" + name);
    try {
      const result = await ghCall<{ ok: boolean; secretNames?: string[]; message?: string }>({
        action: "setSupabaseSecret",
        token,
        repo: managedRepo.trim(),
        supabaseAccessToken: supabaseAccessToken.trim(),
        projectRef: supabaseProjectRef.trim(),
        integration,
        name,
        value,
      });
      setSecretDrafts(current => ({ ...current, [name]: "" }));
      setSupabaseConnection(current => current
        ? { ...current, secretNames: result.secretNames ?? current.secretNames }
        : current);
      setBackendReady(null);
      if (result.message) onLog(result.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save runtime secret";
      setErr(message);
    } finally {
      setLoading(null);
    }
  }

  async function removeRuntimeSecret(integration: FullAppIntegrationId, name: string) {
    if (!supabaseAccessToken.trim() || !supabaseProjectRef.trim()) return;
    if (!window.confirm("Remove " + name + " from this app's Supabase runtime?")) return;
    setErr(null);
    setLoading("secret-delete:" + name);
    try {
      const result = await ghCall<{ ok: boolean; secretNames?: string[]; message?: string }>({
        action: "deleteSupabaseSecret",
        token,
        repo: managedRepo.trim(),
        supabaseAccessToken: supabaseAccessToken.trim(),
        projectRef: supabaseProjectRef.trim(),
        integration,
        name,
      });
      setSupabaseConnection(current => current
        ? { ...current, secretNames: result.secretNames ?? current.secretNames }
        : current);
      setBackendReady(null);
      if (result.message) onLog(result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove runtime secret");
    } finally {
      setLoading(null);
    }
  }

  async function savePublicIntegrationVariable(integration: FullAppIntegrationId, name: string) {
    const value = variableDrafts[name]?.trim() ?? "";
    if (!value) return;
    setErr(null);
    setLoading("variable:" + name);
    try {
      const result = await ghCall<{ ok: boolean; message?: string }>({
        action: "setIntegrationVariable",
        token,
        repo: managedRepo.trim(),
        integration,
        name,
        value,
      });
      setVariableDrafts(current => ({ ...current, [name]: "" }));
      setBackendReady(null);
      if (result.message) onLog(result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save integration variable");
    } finally {
      setLoading(null);
    }
  }

  function domainHealthFlags(value: {
    domain: string;
    httpsEnforced: boolean;
    healthPending: boolean;
    health: unknown;
  }) {
    const root = value.health && typeof value.health === "object"
      ? (value.health as { domain?: { is_valid?: boolean; responds_to_https?: boolean; enforces_https?: boolean; reason?: string | null } }).domain
      : undefined;
    return {
      healthy: !!root?.is_valid,
      https: !!(value.httpsEnforced || root?.enforces_https || root?.responds_to_https),
      reason: root?.reason ?? "",
    };
  }

  async function setCustomDomain() {
    if (!managedRepo.trim() || !customDomainInput.trim()) return;
    setErr(null);
    setLoading("custom-domain");
    try {
      const result = await ghCall<{
        ok: boolean;
        domain: {
          url: string;
          domain: string;
          httpsEnforced: boolean;
          status: string;
          healthPending: boolean;
          health: unknown;
        };
        message?: string;
      }>({
        action: "setCustomDomain",
        token,
        repo: managedRepo.trim(),
        domain: customDomainInput.trim(),
      });
      setDomainStatus(result.domain);
      setCustomDomainInput(result.domain.domain);
      const flags = domainHealthFlags(result.domain);
      onProductionUpdate?.({
        githubRepo: managedRepo.trim(),
        customDomain: result.domain.domain,
        customDomainHealthy: flags.healthy,
        customDomainHttps: flags.https,
        deploymentUrl: flags.healthy && result.domain.domain
          ? "https://" + result.domain.domain + "/"
          : result.domain.url || undefined,
        lastCheckedAt: Date.now(),
      });
      if (result.message) onLog(result.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not configure custom domain";
      setErr(message);
    } finally {
      setLoading(null);
    }
  }

  async function refreshCustomDomain() {
    if (!managedRepo.trim()) return;
    setErr(null);
    setLoading("custom-domain-status");
    try {
      const result = await ghCall<{
        ok: boolean;
        domain: {
          url: string;
          domain: string;
          httpsEnforced: boolean;
          status: string;
          healthPending: boolean;
          health: unknown;
        };
      }>({
        action: "customDomainStatus",
        token,
        repo: managedRepo.trim(),
      });
      setDomainStatus(result.domain);
      if (result.domain.domain) setCustomDomainInput(result.domain.domain);
      const flags = domainHealthFlags(result.domain);
      onProductionUpdate?.({
        githubRepo: managedRepo.trim(),
        customDomain: result.domain.domain || undefined,
        customDomainHealthy: flags.healthy,
        customDomainHttps: flags.https,
        deploymentUrl: flags.healthy && result.domain.domain
          ? "https://" + result.domain.domain + "/"
          : result.domain.url || undefined,
        lastCheckedAt: Date.now(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not check custom domain");
    } finally {
      setLoading(null);
    }
  }

  async function configureAuthForProduction() {
    const siteUrl = domainStatus?.domain
      ? "https://" + domainStatus.domain + "/"
      : hostingUrl;
    if (!siteUrl) {
      setErr("Ship the app or configure/check its custom domain before setting the Supabase Auth Site URL.");
      return;
    }
    if (!supabaseAccessToken.trim() || !/^[a-z0-9]{20}$/.test(supabaseProjectRef.trim())) {
      setErr("Connect the app's Supabase project first with a scoped management token.");
      return;
    }
    if (!window.confirm(
      "Set Supabase Auth Site URL to " + siteUrl + " and add it to the redirect allow-list? Existing redirect entries will be preserved."
    )) return;
    setErr(null);
    setLoading("auth-config");
    try {
      const result = await ghCall<{
        ok: boolean;
        auth: { siteUrl: string; redirectCount: number; preservedRedirectCount: number };
        message?: string;
      }>({
        action: "configureSupabaseAuth",
        token,
        repo: managedRepo.trim(),
        supabaseAccessToken: supabaseAccessToken.trim(),
        projectRef: supabaseProjectRef.trim(),
        siteUrl,
      });
      onProductionUpdate?.({
        githubRepo: managedRepo.trim(),
        supabaseProjectRef: supabaseProjectRef.trim(),
        authSiteUrl: result.auth.siteUrl,
        lastCheckedAt: Date.now(),
      });
      onLog(result.message ?? "Supabase Auth production URL configured.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not configure Supabase Auth";
      setErr(message);
      onLog("Supabase Auth: " + message);
    } finally {
      setLoading(null);
    }
  }

  async function rollbackToRun(run: ManagedRun) {
    if (!managedRepo.trim()) return;
    if (!window.confirm(
      "Roll back the frontend source to this previously successful shipped revision? Obsidian will create a new rollback commit and rerun Build + QA + Ship. The live database/backend will not be rolled back."
    )) return;
    setErr(null);
    setLoading("rollback:" + run.id);
    try {
      const result = await ghCall<{
        ok: boolean;
        status: string;
        rollbackSha?: string;
        url?: string;
        message?: string;
      }>({
        action: "rollbackApp",
        token,
        repo: managedRepo.trim(),
        runId: run.id,
      });
      if (result.url) {
        setHostingUrl(result.url);
        onProductionUpdate?.({
          githubRepo: managedRepo.trim(),
          deploymentUrl: result.url,
          lastCheckedAt: Date.now(),
        });
      }
      setBuilds([]);
      setShips([]);
      setPublishes([]);
      if (result.message) onLog(result.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Rollback failed";
      setErr(message);
      onLog("Rollback: " + message);
    } finally {
      setLoading(null);
    }
  }

  async function syncCurrentFullApp() {
    if (!managedRepo.trim()) { setErr("Enter the GitHub repository name of your Full App."); return; }
    if (!fullAppFiles) { setErr("No editable Full App source is available to sync."); return; }
    setErr(null);
    setLoading("app:syncFullApp");
    try {
      const latestKnownHead =
        builds[0]?.head_sha ||
        ships[0]?.head_sha ||
        undefined;
      const result = await ghCall<{
        ok: boolean;
        status: string;
        previousSha?: string;
        headSha?: string;
        message?: string;
      }>({
        action: "syncFullApp",
        token,
        repo: managedRepo.trim(),
        html: currentHtml,
        title: defaultRepoName,
        files: fullAppFiles,
        addons: fullAppAddons ?? [],
        ...(latestKnownHead ? { expectedHeadSha: latestKnownHead } : {}),
      });
      if (result.message) onLog(result.message);
      onProductionUpdate?.({ githubRepo: managedRepo.trim(), lastCheckedAt: Date.now() });
      setBuilds([]);
      setShips([]);
      setPublishes([]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not sync repaired Full App source";
      setErr(message);
      onLog("Full App sync: " + message);
    } finally {
      setLoading(null);
    }
  }

  async function appAction(action: "buildStatus" | "triggerBuild" | "triggerHealth" | "triggerBackendHealth" | "publishApp" | "shipApp" | "configureAppBackend" | "backendStatus" | "deployBackend") {
    if (!managedRepo.trim()) { setErr("Enter the GitHub repository name of your Full App."); return; }
    let backendApproval = "";
    if (action === "deployBackend") {
      backendApproval = window.prompt(
        "Review the migrations and target app Supabase project. Deployment can change live data and incur charges. Type APPROVE_BACKEND_CHANGES to continue."
      ) || "";
      if (backendApproval !== "APPROVE_BACKEND_CHANGES") return;
    }
    if ((action === "publishApp" || action === "shipApp") && !window.confirm(
      action === "shipApp"
        ? "Run Obsidian Ship? It will build the app, run desktop/mobile browser QA, and publish only if every check passes."
        : "Publish this application's frontend to GitHub Pages? Ensure its backend is configured and its latest build passes. This will make the site public."
    )) return;
    setErr(null); setLoading("app:" + action);
    try {
      const result = await ghCall<{
        ok: boolean; builds?: typeof builds; publishes?: typeof publishes; ships?: typeof ships; health?: typeof health;
        message?: string; url?: string;
        readiness?: NonNullable<typeof backendReady>;
        runs?: typeof backendRuns;
        healthRuns?: typeof backendHealthRuns;
      }>({
        action, token, repo: managedRepo.trim(),
        ...(action === "configureAppBackend" ? { url: appUrl.trim(), publishableKey: appPublishableKey.trim() } : {}),
        ...(action === "backendStatus" || action === "deployBackend" ? {
          integrations: requiredIntegrations,
          ...(supabaseAccessToken.trim() && /^[a-z0-9]{20}$/.test(supabaseProjectRef.trim())
            ? {
                supabaseAccessToken: supabaseAccessToken.trim(),
                projectRef: supabaseProjectRef.trim(),
              }
            : {}),
        } : {}),
        ...(action === "deployBackend" ? { mode: backendMode, approval: backendApproval } : {}),
      });
      if (action === "buildStatus") {
        const nextBuilds = result.builds ?? [];
        const nextPublishes = result.publishes ?? [];
        const nextShips = result.ships ?? [];
        const nextHealth = result.health ?? [];
        setBuilds(nextBuilds);
        setPublishes(nextPublishes);
        setShips(nextShips);
        setHealth(nextHealth);
        onProductionUpdate?.({
          githubRepo: managedRepo.trim(),
          lastBuildRunId: nextBuilds[0]?.id,
          lastBuildConclusion: nextBuilds[0]?.conclusion ?? nextBuilds[0]?.status ?? null,
          lastShipRunId: nextShips[0]?.id,
          lastShipConclusion: nextShips[0]?.conclusion ?? nextShips[0]?.status ?? null,
          lastHealthRunId: nextHealth[0]?.id,
          lastHealthConclusion: nextHealth[0]?.conclusion ?? nextHealth[0]?.status ?? null,
          lastCheckedAt: Date.now(),
        });
      }
      if (action === "backendStatus") {
        const nextBackendHealth = result.healthRuns ?? [];
        setBackendReady(result.readiness ?? null);
        setBackendRuns(result.runs ?? []);
        setBackendHealthRuns(nextBackendHealth);
        onProductionUpdate?.({
          githubRepo: managedRepo.trim(),
          supabaseProjectRef: /^[a-z0-9]{20}$/.test(supabaseProjectRef.trim()) ? supabaseProjectRef.trim() : undefined,
          lastBackendHealthRunId: nextBackendHealth[0]?.id,
          lastBackendHealthConclusion: nextBackendHealth[0]?.conclusion ?? nextBackendHealth[0]?.status ?? null,
          lastCheckedAt: Date.now(),
        });
      }
      if (action === "configureAppBackend") { setAppPublishableKey(""); setBackendReady(null); }
      if (result.url) {
        setHostingUrl(result.url);
        onProductionUpdate?.({ githubRepo: managedRepo.trim(), deploymentUrl: result.url, lastCheckedAt: Date.now() });
      }
      if (result.message) onLog(result.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "GitHub action failed";
      setErr(message); onLog("GitHub Full App: " + message);
    } finally { setLoading(null); }
  }

  async function importOne(repo: Repo) {
    setErr(null);
    setLoading(`import:${repo.full_name}`);
    try {
      const [owner, name] = repo.full_name.split("/");
      const res = await ghCall<{ kind: "html" | "markdown"; content: string }>({
        action: "import",
        token,
        owner,
        repo: name,
      });
      if (res.kind === "html") {
        onImport(res.content);
        onLog(`✓ Imported ${repo.full_name}/index.html`);
        onClose();
      } else {
        onImport(
          `<!doctype html><html><head><meta charset="utf-8"><title>${repo.name}</title></head><body><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;padding:24px;background:#0b0c0f;color:#f2eee7">${res.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</pre></body></html>`,
        );
        onLog(`ℹ Imported README from ${repo.full_name} (no index.html present)`);
        onClose();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "import failed";
      setErr(msg);
      onLog(`✗ Import: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  function disconnect() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setRepos([]);
    setResult(null);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="GitHub deploy"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(3,5,7,0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px,100%)",
          maxHeight: "88dvh",
          overflow: "auto",
          background: "linear-gradient(180deg,#111317,#0b0d10)",
          border: "1px solid rgba(244,161,37,0.28)",
          borderRadius: 16,
          padding: 20,
          color: "#f2eee7",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Github className="h-5 w-5" style={{ color: "#F4A125" }} />
          <h2 style={{ margin: 0, fontFamily: "Fraunces, Georgia, serif", fontSize: 20, color: "#F4A125" }}>
            Deploy to GitHub
          </h2>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: 0, color: "#f2eee7", cursor: "pointer" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!user && (
          <>
            <p style={{ color: "#B6BCC8", fontSize: 13, lineHeight: 1.5 }}>
              Paste a GitHub personal access token. Fine-grained token with{" "}
              <b>Contents: Read &amp; write</b>, <b>Pages: Read &amp; write</b>, and{" "}
              <b>Administration: Read &amp; write</b> on the repos you'll deploy to. Stored only in this browser.
              {" "}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#F4A125" }}
              >
                Create one <ExternalLink className="inline h-3 w-3" />
              </a>
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_… or ghp_…"
                style={{
                  flex: 1,
                  background: "#0b0d10",
                  border: "1px solid rgba(182,188,200,0.24)",
                  color: "#f2eee7",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                className="obs-chip"
                disabled={!token || loading === "verify"}
                onClick={() => connect(token)}
                style={{ background: "#F4A125", color: "#111317", borderColor: "#F4A125" }}
              >
                {loading === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Connect
              </button>
            </div>
          </>
        )}

        {user && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "rgba(244,161,37,0.06)",
                border: "1px solid rgba(244,161,37,0.18)",
                borderRadius: 10,
                marginBottom: 14,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.avatar_url} alt="" width={28} height={28} style={{ borderRadius: 999 }} />
              <div style={{ fontSize: 13 }}>
                Signed in as <b>@{user.login}</b>
              </div>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={disconnect}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(182,188,200,0.24)",
                  color: "#B6BCC8",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            </div>

            <section style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7, marginBottom: 8, textTransform: "uppercase" }}>
                Push current build
              </div>
              <div role="radiogroup" aria-label="Repository export type" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" name="deployMode" checked={deployMode === "static"} onChange={() => setDeployMode("static")} />
                  Static HTML site
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" name="deployMode" checked={deployMode === "full-app"} onChange={() => setDeployMode("full-app")} />
                  Full App (React + Supabase)
                </label>
              </div>
              {deployMode === "full-app" && (
                <p style={{ color: "#B6BCC8", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                  Creates a new GitHub repository containing a React app, authentication, owner-protected database migration,
                  and your original design in a sandboxed preview. Use a fresh repository name; connect your own Supabase project
                  and deploy the source with Vercel, Netlify, or another build-capable host.
                  No production database or hosting is provisioned automatically.
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="repo-name"
                  style={{
                    flex: "1 1 220px",
                    background: "#0b0d10",
                    border: "1px solid rgba(182,188,200,0.24)",
                    color: "#f2eee7",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#B6BCC8" }}>
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                  Private
                </label>
                {deployMode === "static" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#B6BCC8" }}>
                    <input type="checkbox" checked={enablePages} onChange={(e) => setEnablePages(e.target.checked)} />
                    Enable Pages
                  </label>
                )}
                <button
                  type="button"
                  className="obs-chip"
                  disabled={loading === "deploy" || !currentHtml.trim()}
                  onClick={deploy}
                  style={{ background: "#F4A125", color: "#111317", borderColor: "#F4A125" }}
                >
                  {loading === "deploy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                  {deployMode === "full-app" ? "Create Full App" : "Deploy"}
                </button>
              </div>
              {result && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.32)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <b>Repo:</b>{" "}
                    <a href={result.repo.html_url} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125" }}>
                      {result.repo.full_name} <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </div>
                  {result.mode === "full-app" && (
                    <p style={{ color: "#B6BCC8", margin: "8px 0 0" }}>
                      Your full application source is on GitHub. Follow README.md to configure authentication,
                      apply the database migration, test the app, and deploy it to a build-capable host.
                    </p>
                  )}
                  {result.pages && (
                    <div style={{ marginTop: 4 }}>
                      <b>Live:</b>{" "}
                      <a href={result.pages.html_url} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125" }}>
                        {result.pages.html_url} <ExternalLink className="inline h-3 w-3" />
                      </a>
                      <span style={{ opacity: 0.6, marginLeft: 6 }}>
                        (Pages can take 30–90s on first deploy)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section style={{ borderTop: "1px solid rgba(182,188,200,.2)", paddingTop: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: .75, marginBottom: 9 }}>
                Full App · managed build and release
              </div>
              <p style={{ color: "#B6BCC8", fontSize: 12, lineHeight: 1.5 }}>
                GitHub builds your app on isolated runners. Select an exported Full App repository.
                The token needs Actions: Read/Write and Variables: Read/Write to manage builds and public settings,
                plus Pages and Administration write permission to publish.
              </p>
              <input list="obs-managed-repos" aria-label="Full App GitHub repository" value={managedRepo}
                onChange={e => setManagedRepo(e.target.value)} placeholder="Your Full App repository name"
                style={{ width: "100%", background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 9, margin: "8px 0" }} />
              <datalist id="obs-managed-repos">{repos.map(repo => <option key={repo.full_name} value={repo.name}/>)}</datalist>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void appAction("buildStatus")}>Check build + QA status</button>
                <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void appAction("triggerBuild")}>Run build + QA</button>
                <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void appAction("triggerHealth")}>Run live health now</button>
                {fullAppFiles && (
                  <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void syncCurrentFullApp()}>
                    Sync source + rebuild
                  </button>
                )}
                <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void appAction("shipApp")}>Ship verified app</button>
              </div>
              {(builds.length > 0 || publishes.length > 0 || ships.length > 0 || health.length > 0) && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  {([["Build + QA", builds], ["Ship", ships], ["Live Health", health], ["Publish", publishes]] as const).map(([label, runs]) => runs.slice(0, 2).map(run => (
                    <div key={label + run.id} style={{ color: "#B6BCC8", margin: "7px 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span>{label}: {run.conclusion ?? run.status}</span>
                      <a href={run.url} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125" }}>View GitHub run</a>
                      {(label === "Build + QA" || label === "Ship") && run.conclusion && run.conclusion !== "success" && run.conclusion !== "skipped" && (
                        <>
                          {onRepairDiagnostics && (
                            <button
                              type="button"
                              className="obs-chip"
                              disabled={!!loading}
                              onClick={() => void diagnoseRun(run)}
                            >
                              Diagnose & propose repair
                            </button>
                          )}
                          {fullAppFiles && onApplyFullAppFiles && (
                            <button
                              type="button"
                              className="obs-chip"
                              disabled={!!loading}
                              onClick={() => void autoRepairRun(run)}
                            >
                              Auto repair once
                            </button>
                          )}
                        </>
                      )}
                      {label === "Ship" && run.conclusion === "success" && (
                        <button
                          type="button"
                          className="obs-chip"
                          disabled={!!loading}
                          onClick={() => void rollbackToRun(run)}
                        >
                          Roll back to this release
                        </button>
                      )}
                    </div>
                  )))}
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 12, color: "#B6BCC8" }}>Your app's public backend configuration:</p>
                <input value={appUrl} onChange={e => setAppUrl(e.target.value)}
                  aria-label="App Supabase URL" placeholder="https://project.supabase.co"
                  style={{ width: "100%", background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 9, marginBottom: 6 }} />
                <input type="password" value={appPublishableKey} onChange={e => setAppPublishableKey(e.target.value)}
                  aria-label="App Supabase publishable key" placeholder="sb_publishable_..."
                  style={{ width: "100%", background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 9, marginBottom: 8 }} />
                <button type="button" className="obs-chip" disabled={!!loading || !appUrl.trim() || !appPublishableKey.trim()}
                  onClick={() => void appAction("configureAppBackend")}>Save public app settings</button>
              </div>
              <div style={{ marginTop: 15, padding: 12, border: "1px solid rgba(244,161,37,.22)", borderRadius: 10 }}>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Server functions, private files, and database</h3>
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "rgba(255,255,255,.025)", border: "1px solid rgba(182,188,200,.14)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Connect an existing Supabase backend</div>
                  <p style={{ color: "#B6BCC8", fontSize: 11, lineHeight: 1.5, margin: "0 0 8px" }}>
                    Use a scoped Supabase management token and project ref. The token stays in this browser session and is sent only for Management API operations; Obsidian does not save it to the project.
                  </p>
                  <input
                    type="password"
                    value={supabaseAccessToken}
                    onChange={e => setSupabaseAccessToken(e.target.value)}
                    aria-label="Supabase management token"
                    placeholder="Supabase management access token"
                    autoComplete="off"
                    style={{ width: "100%", background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 9, marginBottom: 6 }}
                  />
                  <input
                    value={supabaseProjectRef}
                    onChange={e => setSupabaseProjectRef(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20))}
                    aria-label="Supabase project reference"
                    placeholder="20-character project ref"
                    style={{ width: "100%", background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 9, marginBottom: 7 }}
                  />
                  <button
                    type="button"
                    className="obs-chip"
                    disabled={!!loading || !supabaseAccessToken.trim() || supabaseProjectRef.length !== 20}
                    onClick={() => void connectSupabaseProject()}
                  >
                    Connect Supabase project
                  </button>
                  {supabaseConnection && (
                    <div style={{ marginTop: 8, color: "#B6BCC8", fontSize: 11 }}>
                      ✓ {supabaseConnection.projectName} · {supabaseConnection.projectStatus} · {supabaseConnection.keyKind} key
                    </div>
                  )}
                  {(domainStatus?.domain || hostingUrl) && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
                      <button
                        type="button"
                        className="obs-chip"
                        disabled={!!loading || !supabaseConnection}
                        onClick={() => void configureAuthForProduction()}
                      >
                        Configure Auth for live URL
                      </button>
                      <span style={{ color: "#7f8795", fontSize: 10 }}>
                        {domainStatus?.domain ? "https://" + domainStatus.domain + "/" : hostingUrl}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "rgba(244,161,37,.05)", border: "1px solid rgba(244,161,37,.14)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Backend ownership</div>
                  <p style={{ color: "#B6BCC8", fontSize: 11, lineHeight: 1.5, margin: 0 }}>
                    Obsidian connects to a Supabase project you own instead of silently creating billable infrastructure.
                    Automatic project creation stays disabled until Obsidian can show the live organization-specific cost and receive explicit cost confirmation.
                  </p>
                </div>
                <p style={{ color: "#B6BCC8", fontSize: 12, lineHeight: 1.5 }}>
                  Every app uses its own Supabase project. The connection above discovers the browser-safe URL/key automatically.
                  GitHub deployment still uses a scoped SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD as Actions secrets for CLI deployment.
                  Integration credentials below are stored in Supabase Function Secrets, never frontend code.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button type="button" className="obs-chip" disabled={!!loading}
                    onClick={() => void appAction("backendStatus")}>Check backend readiness</button>
                  <button type="button" className="obs-chip" disabled={!!loading}
                    onClick={() => void appAction("triggerBackendHealth")}>Run backend health now</button>
                  {user && managedRepo && (
                    <a target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125", fontSize: 12, alignSelf: "center" }}
                      href={"https://github.com/" + user.login + "/" + managedRepo + "/settings/secrets/actions"}>
                      Configure GitHub Secrets and Variables
                    </a>
                  )}
                </div>
                {requiredIntegrations.length > 0 && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,.025)" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: .8, opacity: .65, marginBottom: 6 }}>
                      Integration Vault · required by App Architect
                    </div>
                    {requiredIntegrations.map(id => {
                      const def = FULL_APP_INTEGRATIONS[id];
                      return (
                        <div key={id} style={{ padding: "9px 0", borderTop: "1px solid rgba(182,188,200,.10)" }}>
                          <div style={{ fontSize: 12, color: "#f2eee7", fontWeight: 600 }}>{def.label}</div>
                          <div style={{ fontSize: 11, color: "#B6BCC8", marginTop: 2 }}>{def.purpose}</div>
                          {def.secrets.map(name => {
                            const configured = !!supabaseConnection?.secretNames.includes(name);
                            return (
                              <div key={name} style={{ marginTop: 7 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 11, color: configured ? "#9ad3a4" : "#d8a45d" }}>
                                    {configured ? "✓" : "○"} {name}
                                  </span>
                                  {configured && (
                                    <button type="button" className="obs-chip" disabled={!!loading || !supabaseConnection}
                                      onClick={() => void removeRuntimeSecret(id, name)}>
                                      Remove
                                    </button>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                                  <input
                                    type="password"
                                    value={secretDrafts[name] ?? ""}
                                    onChange={e => setSecretDrafts(current => ({ ...current, [name]: e.target.value }))}
                                    placeholder={configured ? "Replace secret value" : "Secret value"}
                                    autoComplete="new-password"
                                    style={{ flex: 1, minWidth: 0, background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 8, fontSize: 11 }}
                                  />
                                  <button
                                    type="button"
                                    className="obs-chip"
                                    disabled={!!loading || !supabaseConnection || !(secretDrafts[name] ?? "").trim()}
                                    onClick={() => void saveRuntimeSecret(id, name)}
                                  >
                                    Save secret
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {def.publicVars.map(name => (
                            <div key={name} style={{ marginTop: 7 }}>
                              <div style={{ fontSize: 11, color: "#B6BCC8" }}>{name} · browser-safe public value</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                                <input
                                  value={variableDrafts[name] ?? ""}
                                  onChange={e => setVariableDrafts(current => ({ ...current, [name]: e.target.value }))}
                                  placeholder="Public configuration value"
                                  style={{ flex: 1, minWidth: 0, background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 8, fontSize: 11 }}
                                />
                                <button
                                  type="button"
                                  className="obs-chip"
                                  disabled={!!loading || !(variableDrafts[name] ?? "").trim()}
                                  onClick={() => void savePublicIntegrationVariable(id, name)}
                                >
                                  Save variable
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
                {backendReady && (
                  <div role="status" style={{ marginTop: 10, color: "#B6BCC8", fontSize: 12 }}>
                    {([
                      ["Supabase project reference", backendReady.hasProjectRef],
                      ["Public app URL", backendReady.hasPublicUrl],
                      ["Public publishable key", backendReady.hasPublicKey],
                      ["GitHub deploy access-token secret", backendReady.hasAccessToken],
                      ["GitHub database-password secret", backendReady.hasDbPassword],
                      ...(requiredIntegrations.length > 0
                        ? [["Supabase runtime integration secrets verified", backendReady.supabaseSecretsVerified === true] as const]
                        : []),
                    ] as const).map(([name, ready]) => (
                      <div key={name}>{ready ? "✓" : "○"} {name}</div>
                    ))}
                    {(backendReady.integrations ?? []).map(integration => (
                      <div key={integration.id} style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(182,188,200,.12)" }}>
                        <div>{integration.ready ? "✓" : "○"} {integration.label}</div>
                        {integration.missingSecrets.map(name => (
                          <div key={name} style={{ paddingLeft: 14, color: "#d8a45d" }}>Missing secret: {name}</div>
                        ))}
                        {integration.missingVariables.map(name => (
                          <div key={name} style={{ paddingLeft: 14, color: "#d8a45d" }}>Missing variable: {name}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {backendRuns.slice(0, 2).map(run => (
                  <p key={run.id} style={{ fontSize: 12, marginTop: 7 }}>
                    Backend: {run.conclusion ?? run.status} ·
                    <a href={run.url} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125", marginLeft: 5 }}>View workflow</a>
                  </p>
                ))}
                {backendHealthRuns.slice(0, 2).map(run => (
                  <p key={"health-" + run.id} style={{ fontSize: 12, marginTop: 7 }}>
                    Backend health: {run.conclusion ?? run.status} ·
                    <a href={run.url} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125", marginLeft: 5 }}>View health run</a>
                  </p>
                ))}
                <label style={{ color: "#B6BCC8", display: "block", fontSize: 12, marginTop: 12 }}>
                  Backend deployment operation
                  <select value={backendMode} onChange={e => setBackendMode(e.target.value as typeof backendMode)}
                    style={{ display: "block", width: "100%", marginTop: 5, background: "#0b0d10", color: "#fff", border: "1px solid #464b56", padding: 8, borderRadius: 8 }}>
                    <option value="functions-only">Deploy server functions only</option>
                    <option value="schema-and-functions">Apply reviewed SQL migrations AND functions</option>
                  </select>
                </label>
                <button type="button" className="obs-chip" style={{ marginTop: 9 }} disabled={!!loading || !backendDeployReady}
                  onClick={() => void appAction("deployBackend")}>Request backend deployment</button>
                {!backendDeployReady && (
                  <p style={{ color: "#B6BCC8", fontSize: 11, marginTop: 7 }}>
                    Run backend readiness first and configure every required backend/integration credential before deployment.
                  </p>
                )}
                <p style={{ color: "#B6BCC8", fontSize: 11, marginTop: 10 }}>
                  Explicit typed approval required. GitHub's production-backend environment can require an additional reviewer.
                  This does not create or purchase a Supabase project automatically.
                </p>
              </div>
              <div style={{ marginTop: 15, padding: 12, border: "1px solid rgba(182,188,200,.16)", borderRadius: 10 }}>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Custom domain</h3>
                <p style={{ color: "#B6BCC8", fontSize: 11, lineHeight: 1.5, margin: "0 0 8px" }}>
                  Bind a domain you own to this GitHub Pages app. For a subdomain, point its CNAME to {user ? user.login + ".github.io" : "YOUR-ACCOUNT.github.io"}.
                  Apex domains need GitHub Pages A/AAAA records at your DNS provider.
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input
                    value={customDomainInput}
                    onChange={e => setCustomDomainInput(e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""))}
                    placeholder="app.example.com"
                    aria-label="Custom domain"
                    style={{ flex: 1, minWidth: 180, background: "#0b0d10", border: "1px solid #464b56", color: "#fff", borderRadius: 8, padding: 8 }}
                  />
                  <button type="button" className="obs-chip" disabled={!!loading || !customDomainInput.trim()}
                    onClick={() => void setCustomDomain()}>
                    Set domain
                  </button>
                  <button type="button" className="obs-chip" disabled={!!loading}
                    onClick={() => void refreshCustomDomain()}>
                    Check DNS / HTTPS
                  </button>
                </div>
                {domainStatus && (() => {
                  const flags = domainHealthFlags(domainStatus);
                  return (
                    <div style={{ marginTop: 8, color: "#B6BCC8", fontSize: 11 }}>
                      <div>{flags.healthy ? "✓" : "○"} DNS / Pages domain: {flags.healthy ? "valid" : domainStatus.healthPending ? "checking" : "not ready"}</div>
                      <div>{flags.https ? "✓" : "○"} HTTPS: {flags.https ? "ready/enforced" : "waiting for eligibility"}</div>
                      {flags.reason && <div style={{ color: "#d8a45d", marginTop: 3 }}>{flags.reason}</div>}
                    </div>
                  );
                })()}
              </div>
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button type="button" className="obs-chip" disabled={!!loading}
                  onClick={() => void appAction("publishApp")}>Publish to GitHub Pages</button>
                {hostingUrl && <a href={hostingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125", fontSize: 12 }}>Open hosted site after deployment completes</a>}
              </div>
              <p style={{ color: "#B6BCC8", fontSize: 11, marginTop: 10 }}>
                "Ship verified app" is the preferred path: it compiles, launches the production build in Chromium,
                checks desktop/mobile rendering and runtime errors, then deploys only after QA passes. Database migration,
                authorization and redirect URLs still require their own backend verification.
              </p>
            </section>

            <section>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  opacity: 0.7,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Import a repo <span style={{ opacity: 0.55 }}>({repos.length})</span>
              </div>
              <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid rgba(182,188,200,0.14)", borderRadius: 10 }}>
                {repos.length === 0 && (
                  <div style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>No repositories found on this account.</div>
                )}
                {repos.map((r) => (
                  <div
                    key={r.full_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderBottom: "1px solid rgba(182,188,200,0.08)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name} {r.private && <span style={{ opacity: 0.5, fontSize: 10 }}>· private</span>}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.55 }}>
                        {new Date(r.updated_at).toLocaleDateString()} · {r.default_branch}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="obs-chip"
                      onClick={() => importOne(r)}
                      disabled={loading === `import:${r.full_name}`}
                      title="Pull index.html (or README) into a new tab"
                    >
                      {loading === `import:${r.full_name}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Import
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {err && (
          <div
            style={{
              marginTop: 14,
              padding: 10,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 8,
              color: "#fca5a5",
              fontSize: 12,
            }}
          >
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
