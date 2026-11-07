import { normalizeDomain, domainRecords, dnsAnswers, PAGES_IPV4 } from "@/lib/owned-domain";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  requirePaidOperation,
  denialResponse,
  settleOperation,
  type EntitlementResult,
} from "@/lib/credit-gate.server";
import { makeUsage } from "@/lib/usage-record";
import { newRequestId } from "@/lib/ai-errors";
import { buildArtifact } from "@/lib/publish-artifact";
import { buildFullAppFiles } from "@/lib/full-app-scaffold";
import { reconcileFullAppFiles } from "@/lib/full-app-edits";
import { validateAppAddons } from "@/lib/full-app-build";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepareDomain"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90), domain: z.string().min(3).max(253) }),
  z.object({ action: z.literal("connectDomain"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90), domain: z.string().min(3).max(253) }),
  z.object({ action: z.literal("domainStatus"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90), domain: z.string().min(3).max(253) }),
  z.object({ action: z.literal("verify"), token: z.string().min(10).max(400) }),
  z.object({ action: z.literal("listRepos"), token: z.string().min(10).max(400) }),
  z.object({
    action: z.literal("deploy"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    html: z.string().min(1).max(4_000_000),
    title: z.string().max(200).optional(),
    enablePages: z.boolean().optional().default(true),
    isPrivate: z.boolean().optional().default(false),
    mode: z.enum(["static", "full-app"]).optional().default("static"),
    files: z.record(z.string(), z.string()).optional(),
    addons: z.array(z.string()).max(4).optional(),
  }),
  z.object({ action: z.literal("buildStatus"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({ action: z.literal("triggerBuild"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({ action: z.literal("publishApp"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({ action: z.literal("backendStatus"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({
    action: z.literal("deployBackend"), token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    mode: z.enum(["functions-only", "schema-and-functions"]),
    approval: z.literal("APPROVE_BACKEND_CHANGES"),
  }),
  z.object({
    action: z.literal("configureAppBackend"),
    token: z.string().min(10).max(400), repo: z.string().min(1).max(90),
    url: z.string().url().max(250),
    publishableKey: z.string().min(15).max(220),
  }),
  z.object({
    action: z.literal("import"),
    token: z.string().min(10).max(400),
    owner: z.string().min(1).max(80),
    repo: z.string().min(1).max(90),
  }),
]);

const GH = "https://api.github.com";

async function gh(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AetherisObsidian",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function b64(str: string) {
  // Cloudflare Worker: btoa handles ASCII only; use TextEncoder + chunked conversion.
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromB64(str: string) {
  const clean = str.replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || `obsidian-build-${Date.now().toString(36)}`
  );
}

async function ghJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 300) || `GitHub ${res.status}`);
  }
}

async function getUser(token: string) {
  const r = await gh(token, "/user");
  if (r.status === 401) throw new Error("Invalid GitHub token.");
  if (!r.ok) throw new Error(`GitHub auth failed (${r.status}).`);
  return (await ghJson(r)) as { login: string; avatar_url: string; name?: string };
}

async function ensureRepo(token: string, login: string, name: string, isPrivate: boolean) {
  const check = await gh(token, `/repos/${login}/${name}`);
  if (check.ok) return (await ghJson(check)) as { default_branch: string };
  if (check.status !== 404) throw new Error(`Repo lookup failed (${check.status}).`);
  const create = await gh(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: "Built with Aetheris Obsidian",
      auto_init: true,
      private: isPrivate,
    }),
  });
  if (!create.ok) {
    const body = await create.text();
    throw new Error(`Create repo failed (${create.status}): ${body.slice(0, 200)}`);
  }
  return (await ghJson(create)) as { default_branch: string };
}

/** Full-app publishing is an atomic tree commit on a NEW repository.
 * Never overwrite an existing project or expose runtime secrets.
 */
async function putFullAppFiles(
  token: string, login: string, repo: string, branch: string,
  files: Record<string, string>, title: string,
) {
  const refPath = "/repos/" + login + "/" + repo + "/git/ref/heads/" + encodeURIComponent(branch);
  const ref = await gh(token, refPath);
  if (!ref.ok) throw new Error("Could not read the new repository branch.");
  const parentSha = ((await ghJson(ref)) as { object: { sha: string } }).object.sha;
  const parentRes = await gh(token, "/repos/" + login + "/" + repo + "/git/commits/" + parentSha);
  if (!parentRes.ok) throw new Error("Could not read the repository HEAD.");
  const treeSha = ((await ghJson(parentRes)) as { tree: { sha: string } }).tree.sha;
  const entries = Object.entries(files).map(([path, content]) => ({
    path, mode: "100644", type: "blob", content,
  }));
  const treeRes = await gh(token, "/repos/" + login + "/" + repo + "/git/trees", {
    method: "POST", body: JSON.stringify({ base_tree: treeSha, tree: entries }),
  });
  if (!treeRes.ok) throw new Error("Could not create full-app source tree.");
  const newTree = ((await ghJson(treeRes)) as { sha: string }).sha;
  const commitRes = await gh(token, "/repos/" + login + "/" + repo + "/git/commits", {
    method: "POST", body: JSON.stringify({ message: "Initialize full app: " + title, tree: newTree, parents: [parentSha] }),
  });
  if (!commitRes.ok) throw new Error("Could not create full-app commit.");
  const nextSha = ((await ghJson(commitRes)) as { sha: string }).sha;
  const update = await gh(token, "/repos/" + login + "/" + repo + "/git/refs/heads/" + encodeURIComponent(branch), {
    method: "PATCH", body: JSON.stringify({ sha: nextSha, force: false }),
  });
  if (!update.ok) throw new Error("Could not move new repository branch to full-app commit.");
}

async function putFile(
  token: string,
  login: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
) {
  const existing = await gh(token, `/repos/${login}/${repo}/contents/${path}?ref=${branch}`);
  const sha = existing.ok ? ((await ghJson(existing)) as { sha: string }).sha : undefined;
  const r = await gh(token, `/repos/${login}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: b64(content), branch, ...(sha ? { sha } : {}) }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Write ${path} failed (${r.status}): ${body.slice(0, 200)}`);
  }
  return ghJson(r);
}

async function enablePages(token: string, login: string, repo: string, branch: string) {
  const existing = await gh(token, `/repos/${login}/${repo}/pages`);
  if (existing.ok) {
    const p = (await ghJson(existing)) as { html_url: string };
    return { html_url: p.html_url, alreadyEnabled: true };
  }
  const r = await gh(token, `/repos/${login}/${repo}/pages`, {
    method: "POST",
    body: JSON.stringify({ source: { branch, path: "/" } }),
  });
  if (!r.ok && r.status !== 409) {
    const body = await r.text();
    throw new Error(`Enable Pages failed (${r.status}): ${body.slice(0, 200)}`);
  }
  return { html_url: `https://${login}.github.io/${repo}/`, alreadyEnabled: false };
}

async function listRepos(token: string) {
  const r = await gh(token, "/user/repos?per_page=100&sort=updated&affiliation=owner");
  if (!r.ok) throw new Error(`List repos failed (${r.status}).`);
  const list = (await ghJson(r)) as Array<{
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    updated_at: string;
    default_branch: string;
  }>;
  return list.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    private: r.private,
    html_url: r.html_url,
    updated_at: r.updated_at,
    default_branch: r.default_branch,
  }));
}

async function importRepo(token: string, owner: string, repo: string) {
  // Prefer index.html; fall back to README.md.
  const idx = await gh(token, `/repos/${owner}/${repo}/contents/index.html`);
  if (idx.ok) {
    const j = (await ghJson(idx)) as { content: string; encoding: string };
    const html = j.encoding === "base64" ? fromB64(j.content) : j.content;
    return { kind: "html" as const, content: html };
  }
  const readme = await gh(token, `/repos/${owner}/${repo}/readme`);
  if (readme.ok) {
    const j = (await ghJson(readme)) as { content: string; encoding: string };
    const md = j.encoding === "base64" ? fromB64(j.content) : j.content;
    return { kind: "markdown" as const, content: md };
  }
  throw new Error("No index.html or README.md found in that repo.");
}


function managedRepoName(name: string): string {
  if (!/^[a-zA-Z0-9._-]{1,90}$/.test(name) || name === "." || name === "..")
    throw new Error("Invalid repository name.");
  return name;
}
async function managedAppRepo(token: string, login: string, name: string) {
  const repo = managedRepoName(name);
  const r = await gh(token, "/repos/" + login + "/" + repo + "/contents/.github/workflows/obsidian-build.yml");
  if (!r.ok) throw new Error("This repository does not contain an Obsidian Full App build workflow.");
  return repo;
}
async function managedDefaultHead(token: string, login: string, repo: string) {
  const r = await gh(token, "/repos/" + login + "/" + repo);
  if (!r.ok) throw new Error("Unable to inspect application repository.");
  const info = await ghJson(r) as { default_branch: string };
  const branch = info.default_branch;
  if (!branch || !/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error("Invalid repository default branch.");
  const headRes = await gh(token, "/repos/" + login + "/" + repo + "/git/ref/heads/" + branch.split("/").map(encodeURIComponent).join("/"));
  if (!headRes.ok) throw new Error("Unable to inspect current application source revision.");
  const head = await ghJson(headRes) as { object: { sha: string } };
  return { branch, sha: head.object.sha };
}
async function workflowDispatch(token: string, login: string, repo: string, file: string, inputs?: Record<string, string>) {
  const { branch } = await managedDefaultHead(token, login, repo);
  const r = await gh(token, "/repos/" + login + "/" + repo + "/actions/workflows/" + file + "/dispatches", {
    method: "POST", body: JSON.stringify({ ref: branch, ...(inputs ? { inputs } : {}) }),
  });
  if (!r.ok) throw new Error("GitHub could not start " + file + " (" + r.status + "). Check Actions: write permissions and the default branch.");
}
async function managedRunStatus(token: string, login: string, repo: string, file: string) {
  const r = await gh(token, "/repos/" + login + "/" + repo + "/actions/workflows/" + file + "/runs?per_page=4");
  if (!r.ok) throw new Error("Could not read GitHub workflow runs (" + r.status + ").");
  const j = await ghJson(r) as { workflow_runs?: Array<{
    id: number; status: string; conclusion: string | null; html_url: string;
    created_at: string; head_sha: string;
  }> };
  return (j.workflow_runs ?? []).map(x => ({
    id: x.id, status: x.status, conclusion: x.conclusion, url: x.html_url,
    created_at: x.created_at, head_sha: x.head_sha,
  }));
}
async function setPublicRepoVariable(token: string, login: string, repo: string, name: string, value: string) {
  const url = "/repos/" + login + "/" + repo + "/actions/variables/" + name;
  const current = await gh(token, url);
  const method = current.ok ? "PATCH" : "POST";
  if (!current.ok && current.status !== 404) throw new Error("Could not check repository variables.");
  const path = method === "PATCH" ? url : "/repos/" + login + "/" + repo + "/actions/variables";
  const r = await gh(token, path, { method, body: JSON.stringify({ name, value }) });
  if (!r.ok) throw new Error("Could not configure GitHub Actions variables (" + r.status + "). Check Variables: write permissions.");
}

async function backendReadiness(token: string, login: string, repo: string) {
  const workflow = await gh(token, "/repos/" + login + "/" + repo +
    "/contents/.github/workflows/obsidian-backend.yml");
  if (!workflow.ok) throw new Error("This app does not contain the backend deployment workflow. Export a new Full App.");
  const [secretsRes, varsRes] = await Promise.all([
    gh(token, "/repos/" + login + "/" + repo + "/actions/secrets?per_page=100"),
    gh(token, "/repos/" + login + "/" + repo + "/actions/variables?per_page=100"),
  ]);
  if (!secretsRes.ok || !varsRes.ok)
    throw new Error("GitHub token requires Actions secrets and variables read permissions to inspect backend readiness.");
  const secrets = await ghJson(secretsRes) as { secrets?: Array<{ name: string }> };
  const vars = await ghJson(varsRes) as { variables?: Array<{ name: string }> };
  const secretNames = new Set((secrets.secrets ?? []).map(s => s.name));
  const variableNames = new Set((vars.variables ?? []).map(s => s.name));
  return {
    hasAccessToken: secretNames.has("SUPABASE_ACCESS_TOKEN"),
    hasDbPassword: secretNames.has("SUPABASE_DB_PASSWORD"),
    hasProjectRef: variableNames.has("SUPABASE_PROJECT_REF"),
    hasPublicUrl: variableNames.has("VITE_SUPABASE_URL"),
    hasPublicKey: variableNames.has("VITE_SUPABASE_PUBLISHABLE_KEY"),
  };
}

async function initializeManagedPages(token: string, login: string, repo: string) {
  const base = "/repos/" + login + "/" + repo + "/pages";
  const existing = await gh(token, base);
  const r = await gh(token, base, {
    method: existing.ok ? "PUT" : "POST",
    body: JSON.stringify({ build_type: "workflow" }),
  });
  if (!r.ok && r.status !== 409)
    throw new Error("Could not enable GitHub Pages Actions hosting (" + r.status + "). Check Pages permissions and plan.");
  return "https://" + login.toLowerCase() + ".github.io/" + repo + "/";
}

export const Route = createFileRoute("/api/github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        let entitlement: EntitlementResult | null = null;
        let settled = false;
        try {
          const parsed = bodySchema.parse(await request.json());

          if (parsed.action === "deploy") {
            entitlement = await requirePaidOperation(request, "github_deploy", requestId);
            if (entitlement.kind === "denied" && entitlement.denial) {
              return denialResponse(entitlement.denial, requestId);
            }
          } else {
            // Free-tier gate for verify/listRepos/import: owner cookie OR active Pro.
            const { isUnlockedServer } = await import("@/lib/gate.server");
            if (!(await isUnlockedServer())) {
              const { resolveUserFromRequest, hasActivePro, serverStripeEnv } = await import("@/lib/credit-gate.server");
              const { creditsRequiredEnvelope } = await import("@/lib/credit-gate");
              const u = await resolveUserFromRequest(request);
              if (!u) {
                return denialResponse(creditsRequiredEnvelope({
                  code: "auth_required",
                  message: "Sign in and activate Obsidian Pro to use GitHub.",
                }));
              }
              const pro = await hasActivePro(u, serverStripeEnv());
              if (!pro) {
                return denialResponse(creditsRequiredEnvelope({
                  code: "not_pro",
                  message: "GitHub integration requires Obsidian Pro.",
                }));
              }
            }
          }

          if (parsed.action === "prepareDomain" || parsed.action === "connectDomain" || parsed.action === "domainStatus") {
            const user = await getUser(parsed.token);
            const repo = managedRepoName(parsed.repo);
            const domain = normalizeDomain(parsed.domain);
            const { branch } = await managedDefaultHead(parsed.token, user.login, repo);
            const base = "/repos/" + user.login + "/" + repo;
            const manifestPath = ".obsidian/domain.json";
            const manifestRes = await gh(parsed.token, base + "/contents/" + manifestPath + "?ref=" + encodeURIComponent(branch));
            let manifest: { domain: string; proof: string } | null = null;
            if (manifestRes.ok) {
              const file = await ghJson(manifestRes) as { content: string };
              manifest = JSON.parse(fromB64(file.content));
            } else if (manifestRes.status !== 404) throw new Error("Could not read domain configuration.");
            if (parsed.action === "prepareDomain") {
              if (!manifest || manifest.domain !== domain) {
                manifest = { domain, proof: "obsidian-domain=" + user.login.toLowerCase() + "/" + repo.toLowerCase() + ":" + crypto.randomUUID() };
                await putFile(parsed.token, user.login, repo, manifestPath, JSON.stringify(manifest, null, 2), "Prepare owned-domain verification", branch);
              }
              return Response.json({ ok: true, domain, records: domainRecords(domain, user.login, manifest.proof),
                message: "Add the TXT proof and either the CNAME or root A records at your DNS provider, then connect." });
            }
            if (!manifest || manifest.domain !== domain) throw new Error("Prepare this domain first.");
            const [txt, cname, addresses] = await Promise.all([
              dnsAnswers("_obsidian-verification." + domain, "TXT"), dnsAnswers(domain, "CNAME"), dnsAnswers(domain, "A"),
            ]);
            const owned = txt.includes(manifest.proof.toLowerCase());
            const dnsReady = cname.includes(user.login.toLowerCase() + ".github.io") ||
              (addresses.length > 0 && addresses.every(ip => PAGES_IPV4.includes(ip)));
            const pagesPath = base + "/pages";
            if (parsed.action === "connectDomain") {
              if (!owned) throw new Error("Ownership TXT record is missing or still propagating. Keep the record and retry.");
              if (!dnsReady) throw new Error("Ownership verified. Hosting DNS is not pointing to GitHub Pages yet.");
              const existing = await gh(parsed.token, pagesPath);
              if (!existing.ok) throw new Error("Publish this repository to GitHub Pages first.");
              const config = await ghJson(existing) as { build_type?: string; cname?: string };
              if (config.cname && config.cname !== domain) throw new Error("This repository already has another custom domain. Remove it in GitHub Pages settings before switching.");
              // Workflow sites copy public/CNAME; branch sites read root/CNAME.
              await putFile(parsed.token, user.login, repo, config.build_type === "workflow" ? "public/CNAME" : "CNAME",
                domain + "\n", "Connect verified owned domain", branch);
              if (config.build_type === "workflow") {
                const workflowRes = await gh(parsed.token, base + "/contents/.github/workflows/obsidian-publish.yml?ref=" + encodeURIComponent(branch));
                if (!workflowRes.ok) throw new Error("Missing Obsidian publishing workflow.");
                const workflow = fromB64((await ghJson(workflowRes)).content);
                // Upgrade previously exported projects to use a root asset base on custom domains.
                const updated = workflow.replace("GITHUB_PAGES_BASE: /" + "$" + "{{ github.event.repository.name }}/",
                  "GITHUB_PAGES_BASE: " + "$" + "{{ vars.OBSIDIAN_PAGES_BASE || format('/{0}/', github.event.repository.name) }}");
                if (updated !== workflow) await putFile(parsed.token, user.login, repo, ".github/workflows/obsidian-publish.yml", updated, "Support custom-domain asset paths", branch);
                await setPublicRepoVariable(parsed.token, user.login, repo, "OBSIDIAN_PAGES_BASE", "/");
              }
              const configured = await gh(parsed.token, pagesPath, { method: "PUT", body: JSON.stringify({ cname: domain }) });
              if (!configured.ok) throw new Error("GitHub could not attach the domain (" + configured.status + "). Review Pages permissions and GitHub domain verification.");
              if (config.build_type === "workflow") await workflowDispatch(parsed.token, user.login, repo, "obsidian-publish.yml");
            }
            const pagesRes = await gh(parsed.token, pagesPath);
            if (!pagesRes.ok) throw new Error("Could not inspect GitHub Pages.");
            const pages = await ghJson(pagesRes) as { cname?: string; https_enforced?: boolean; https_certificate?: { state?: string }; protected_domain_state?: string };
            const certificateReady = pages.https_certificate?.state === "approved";
            if (owned && dnsReady && pages.cname === domain && certificateReady && !pages.https_enforced) {
              const enforce = await gh(parsed.token, pagesPath, { method: "PUT", body: JSON.stringify({ https_enforced: true }) });
              if (enforce.ok) pages.https_enforced = true;
            }
            const ready = owned && dnsReady && pages.cname === domain && certificateReady && !!pages.https_enforced;
            return Response.json({ ok: true, domain, owned, dnsReady, ready,
              certificate: pages.https_certificate?.state ?? "pending", httpsEnforced: !!pages.https_enforced,
              records: domainRecords(domain, user.login, manifest.proof),
              url: ready ? "https://" + domain + "/" : null,
              fallbackUrl: "https://" + user.login.toLowerCase() + ".github.io/" + repo + "/",
              message: ready ? "Custom domain is ready." : "Domain setup is pending. Check DNS, deployment and GitHub certificate provisioning, then check again." });
          }

          if (parsed.action === "buildStatus" || parsed.action === "triggerBuild" ||
              parsed.action === "publishApp" || parsed.action === "configureAppBackend" ||
              parsed.action === "backendStatus" || parsed.action === "deployBackend") {
            const user = await getUser(parsed.token);
            const appRepo = await managedAppRepo(parsed.token, user.login, parsed.repo);
            if (parsed.action === "backendStatus" || parsed.action === "deployBackend") {
              const readiness = await backendReadiness(parsed.token, user.login, appRepo);
              if (parsed.action === "backendStatus") {
                const runs = await managedRunStatus(parsed.token, user.login, appRepo, "obsidian-backend.yml");
                return Response.json({ ok: true, readiness, runs });
              }
              if (!readiness.hasAccessToken || !readiness.hasProjectRef ||
                  (parsed.mode === "schema-and-functions" && !readiness.hasDbPassword)) {
                throw new Error("Configure this app's separate Supabase project reference and GitHub Actions secrets before deployment.");
              }
              // The caller must explicitly type approval, GitHub Actions repeats
              // the check, and the production-backend environment may require reviewers.
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-backend.yml", {
                mode: parsed.mode, approval: parsed.approval,
              });
              return Response.json({ ok: true, status: "queued", message:
                "Backend deployment requested. Review GitHub Actions and production-backend approval before using live data." });
            }
            if (parsed.action === "buildStatus") {
              const [builds, publishes] = await Promise.all([
                managedRunStatus(parsed.token, user.login, appRepo, "obsidian-build.yml"),
                managedRunStatus(parsed.token, user.login, appRepo, "obsidian-publish.yml"),
              ]);
              return Response.json({ ok: true, repo: appRepo, builds, publishes });
            }
            if (parsed.action === "triggerBuild") {
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-build.yml");
              return Response.json({ ok: true, status: "queued", message: "Build requested. Refresh status to see the run." });
            }
            if (parsed.action === "configureAppBackend") {
              const url = new URL(parsed.url);
              if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") ||
                  url.username || url.password || url.search || url.hash || url.pathname !== "/") {
                throw new Error("Use your own HTTPS Supabase project URL, ending in .supabase.co.");
              }
              if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(parsed.publishableKey)) {
                throw new Error("Use a Supabase publishable key (sb_publishable_), never a secret or service-role key.");
              }
              await setPublicRepoVariable(parsed.token, user.login, appRepo, "VITE_SUPABASE_URL", url.toString().replace(/\/$/, ""));
              await setPublicRepoVariable(parsed.token, user.login, appRepo, "SUPABASE_PROJECT_REF", url.hostname.slice(0, -".supabase.co".length));
              await setPublicRepoVariable(parsed.token, user.login, appRepo, "VITE_SUPABASE_PUBLISHABLE_KEY", parsed.publishableKey);
              return Response.json({ ok: true, message: "Public app configuration saved in GitHub repository variables." });
            }
            const { sha } = await managedDefaultHead(parsed.token, user.login, appRepo);
            const recentBuilds = await managedRunStatus(parsed.token, user.login, appRepo, "obsidian-build.yml");
            const verified = recentBuilds.some(run => run.head_sha === sha && run.conclusion === "success");
            if (!verified) {
              throw new Error("Run and pass a production build for the current GitHub revision before publishing.");
            }
            const url = await initializeManagedPages(parsed.token, user.login, appRepo);
            await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-publish.yml");
            return Response.json({ ok: true, status: "queued", url, message: "Publication queued. Verify a successful workflow before sharing." });
          }
          if (parsed.action === "verify") {
            const user = await getUser(parsed.token);
            return Response.json({ ok: true, user });
          }
          if (parsed.action === "listRepos") {
            const [user, repos] = await Promise.all([
              getUser(parsed.token),
              listRepos(parsed.token),
            ]);
            return Response.json({ ok: true, user, repos });
          }
          if (parsed.action === "import") {
            const file = await importRepo(parsed.token, parsed.owner, parsed.repo);
            return Response.json({ ok: true, ...file });
          }
          // deploy — flat 1-credit success charge (no upstream token cost)
          const user = await getUser(parsed.token);
          const name = slugify(parsed.repo);
          // A complete app always starts in its own repository. Never silently
          // overwrite someone's existing code or switch their Pages deployment.
          if (parsed.mode === "full-app") {
            const exists = await gh(parsed.token, "/repos/" + user.login + "/" + name);
            if (exists.ok) throw new Error("Choose a new repository name for Full App. Existing repositories will not be overwritten.");
            if (exists.status !== 404) throw new Error("GitHub repository availability could not be verified.");
          }
          const repoInfo = await ensureRepo(parsed.token, user.login, name, parsed.isPrivate);
          const branch = repoInfo.default_branch || "main";
          const title = parsed.title || name;
          const readme = `# ${title}\n\nBuilt with **Aetheris Obsidian** — https://obsidiancoder.lovable.app\n\nOpen \`index.html\` locally or view the live GitHub Pages URL.\n`;
          if (parsed.mode === "full-app") {
            const artifact = buildArtifact({ html: parsed.html, surface: "publish" });
            if (!artifact.safeToPublish) throw new Error("The generated design did not pass the publish safety gate.");
            await putFullAppFiles(parsed.token, user.login, name, branch,
              parsed.files ? reconcileFullAppFiles(artifact.html, title, parsed.files, validateAppAddons(parsed.addons))
                : buildFullAppFiles(artifact.html, title, validateAppAddons(parsed.addons)), title);
          } else {
            await putFile(parsed.token, user.login, name, "index.html", parsed.html, `Deploy: ${title}`, branch);
            await putFile(parsed.token, user.login, name, "README.md", readme, "Add README", branch);
          }
          let pages: { html_url: string; alreadyEnabled: boolean } | null = null;
          if (parsed.enablePages && parsed.mode === "static") {
            try { pages = await enablePages(parsed.token, user.login, name, branch); }
            catch { pages = null; }
          }
          if (entitlement) {
            settled = true;
            await settleOperation(entitlement, {
              kind: "success",
              usage: makeUsage({
                provider: "github", operation: "github_deploy",
                actualCostUsd: 0, costBasis: "actual", providerUsed: true, status: "committed",
                credits: 1,
                meta: { repo: name, pages: !!pages, mode: parsed.mode },
              }),
            });
          }
          return Response.json({
            ok: true,
            user: { login: user.login },
            repo: { name, full_name: `${user.login}/${name}`, html_url: `https://github.com/${user.login}/${name}` },
            pages,
            mode: parsed.mode,
          });
        } catch (err) {
          if (!settled && entitlement) {
            try { await settleOperation(entitlement, { kind: "no_provider", errorCode: "github_deploy_failed" }); }
            catch { /* already settled */ }
          }
          const msg = err instanceof Error ? err.message : "GitHub request failed.";
          return Response.json({ error: msg }, { status: 400 });
        }
      },
    },
  },
});
