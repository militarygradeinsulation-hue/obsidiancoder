import * as React from "react";
import { Github, Loader2, ExternalLink, Rocket, Download, Check, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { requirePaidAction, type GuardOperation } from "@/lib/action-guard";

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
  triggerBuild: "github_deploy",
  configureAppBackend: "github_deploy",
  publishApp: "github_deploy",
  backendStatus: "github_list",
  deployBackend: "github_deploy",
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
}) {
  const { open, onClose, currentHtml, defaultRepoName, onImport, onLog, fullAppFiles, fullAppAddons, defaultDeployMode = "static" } = props;
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
  const [builds, setBuilds] = React.useState<Array<{ id: number; status: string; conclusion: string | null; url: string; created_at: string }>>([]);
  const [publishes, setPublishes] = React.useState<Array<{ id: number; status: string; conclusion: string | null; url: string; created_at: string }>>([]);
  const [hostingUrl, setHostingUrl] = React.useState("");
  const [backendMode, setBackendMode] = React.useState<"functions-only" | "schema-and-functions">("functions-only");
  const [backendReady, setBackendReady] = React.useState<null | {
    hasAccessToken: boolean; hasDbPassword: boolean; hasProjectRef: boolean;
    hasPublicUrl: boolean; hasPublicKey: boolean;
  }>(null);
  const [backendRuns, setBackendRuns] = React.useState<typeof builds>([]);

  React.useEffect(() => {
    if (!open) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : "";
    if (stored) setToken(stored);
    setRepoName(defaultRepoName);
    setDeployMode(defaultDeployMode);
    setResult(null);
    setErr(null);
  }, [open, defaultRepoName]);

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
      if (res.mode === "full-app") setManagedRepo(res.repo.name);
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

  async function appAction(action: "buildStatus" | "triggerBuild" | "publishApp" | "configureAppBackend" | "backendStatus" | "deployBackend") {
    if (!managedRepo.trim()) { setErr("Enter the GitHub repository name of your Full App."); return; }
    let backendApproval = "";
    if (action === "deployBackend") {
      backendApproval = window.prompt(
        "Review the migrations and target app Supabase project. Deployment can change live data and incur charges. Type APPROVE_BACKEND_CHANGES to continue."
      ) || "";
      if (backendApproval !== "APPROVE_BACKEND_CHANGES") return;
    }
    if (action === "publishApp" && !window.confirm(
      "Publish this application's frontend to GitHub Pages? Ensure its backend is configured and its latest build passes. This will make the site public."
    )) return;
    setErr(null); setLoading("app:" + action);
    try {
      const result = await ghCall<{
        ok: boolean; builds?: typeof builds; publishes?: typeof publishes;
        message?: string; url?: string;
        readiness?: NonNullable<typeof backendReady>;
        runs?: typeof backendRuns;
      }>({
        action, token, repo: managedRepo.trim(),
        ...(action === "configureAppBackend" ? { url: appUrl.trim(), publishableKey: appPublishableKey.trim() } : {}),
        ...(action === "deployBackend" ? { mode: backendMode, approval: backendApproval } : {}),
      });
      if (action === "buildStatus") {
        setBuilds(result.builds ?? []);
        setPublishes(result.publishes ?? []);
      }
      if (action === "backendStatus") {
        setBackendReady(result.readiness ?? null);
        setBackendRuns(result.runs ?? []);
      }
      if (action === "configureAppBackend") { setAppPublishableKey(""); setBackendReady(null); }
      if (result.url) setHostingUrl(result.url);
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
                <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void appAction("buildStatus")}>Check build status</button>
                <button className="obs-chip" type="button" disabled={!!loading} onClick={() => void appAction("triggerBuild")}>Run production build</button>
              </div>
              {(builds.length > 0 || publishes.length > 0) && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  {([["Build", builds], ["Publish", publishes]] as const).map(([label, runs]) => runs.slice(0, 2).map(run => (
                    <p key={label + run.id} style={{ color: "#B6BCC8", margin: "6px 0" }}>
                      {label}: {run.conclusion ?? run.status} · <a href={run.url} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125" }}>View GitHub run</a>
                    </p>
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
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button type="button" className="obs-chip" disabled={!!loading}
                  onClick={() => void appAction("publishApp")}>Publish to GitHub Pages</button>
                {hostingUrl && <a href={hostingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#F4A125", fontSize: 12 }}>Open hosted site after deployment completes</a>}
              </div>
              <p style={{ color: "#B6BCC8", fontSize: 11, marginTop: 10 }}>
                Publishing is opt-in and makes the frontend public. Database migration, authorization,
                redirect URLs and successful production workflow must be verified separately.
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
