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
import {
  FULL_APP_INTEGRATION_IDS,
  FULL_APP_INTEGRATIONS,
  integrationPublicVariableNames,
  integrationSecretNames,
  type FullAppIntegrationId,
} from "@/lib/full-app-integrations";

const bodySchema = z.discriminatedUnion("action", [
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
  z.object({
    action: z.literal("buildDiagnostics"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    runId: z.number().int().positive(),
  }),
  z.object({ action: z.literal("triggerBuild"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({ action: z.literal("triggerHealth"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({ action: z.literal("triggerBackendHealth"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({
    action: z.literal("syncFullApp"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    html: z.string().min(1).max(4_000_000),
    title: z.string().min(1).max(200),
    files: z.record(z.string(), z.string()),
    addons: z.array(z.string()).max(4).optional(),
    expectedHeadSha: z.string().regex(/^[0-9a-f]{40}$/i).optional(),
  }),
  z.object({ action: z.literal("publishApp"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({ action: z.literal("shipApp"), token: z.string().min(10).max(400), repo: z.string().min(1).max(90) }),
  z.object({
    action: z.literal("setCustomDomain"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    domain: z.string().trim().min(3).max(63),
  }),
  z.object({
    action: z.literal("customDomainStatus"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
  }),
  z.object({
    action: z.literal("rollbackApp"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    runId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("backendStatus"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    integrations: z.array(z.enum(FULL_APP_INTEGRATION_IDS as [FullAppIntegrationId, ...FullAppIntegrationId[]])).max(8).optional().default([]),
    supabaseAccessToken: z.string().min(20).max(600).optional(),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/).optional(),
  }),
  z.object({
    action: z.literal("deployBackend"), token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    mode: z.enum(["functions-only", "schema-and-functions"]),
    approval: z.literal("APPROVE_BACKEND_CHANGES"),
    integrations: z.array(z.enum(FULL_APP_INTEGRATION_IDS as [FullAppIntegrationId, ...FullAppIntegrationId[]])).max(8).optional().default([]),
    supabaseAccessToken: z.string().min(20).max(600).optional(),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/).optional(),
  }),
  z.object({
    action: z.literal("provisionBackend"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    projectName: z.string().trim().min(2).max(80),
    region: z.string().regex(/^[a-z0-9-]{4,24}$/),
    approval: z.literal("CREATE_SUPABASE_PROJECT"),
  }),
  z.object({
    action: z.literal("connectSupabaseBackend"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    supabaseAccessToken: z.string().min(20).max(600),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
  }),
  z.object({
    action: z.literal("setSupabaseSecret"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    supabaseAccessToken: z.string().min(20).max(600),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    integration: z.enum(FULL_APP_INTEGRATION_IDS as [FullAppIntegrationId, ...FullAppIntegrationId[]]),
    name: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
    value: z.string().min(1).max(24_576),
  }),
  z.object({
    action: z.literal("deleteSupabaseSecret"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    supabaseAccessToken: z.string().min(20).max(600),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    integration: z.enum(FULL_APP_INTEGRATION_IDS as [FullAppIntegrationId, ...FullAppIntegrationId[]]),
    name: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
  }),
  z.object({
    action: z.literal("setIntegrationVariable"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    integration: z.enum(FULL_APP_INTEGRATION_IDS as [FullAppIntegrationId, ...FullAppIntegrationId[]]),
    name: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
    value: z.string().min(1).max(2_048),
  }),
  z.object({
    action: z.literal("configureSupabaseAuth"),
    token: z.string().min(10).max(400),
    repo: z.string().min(1).max(90),
    supabaseAccessToken: z.string().min(20).max(600),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    siteUrl: z.string().url().max(500),
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
const SUPABASE_MANAGEMENT = "https://api.supabase.com";

async function supabaseManagement(
  accessToken: string,
  path: string,
  init: RequestInit = {},
) {
  return fetch(SUPABASE_MANAGEMENT + path, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function supabaseJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new Error("Supabase Management API returned an invalid response."); }
}

function assertIntegrationSecretName(id: FullAppIntegrationId, name: string) {
  if (!(FULL_APP_INTEGRATIONS[id].secrets as readonly string[]).includes(name)) {
    throw new Error("That secret is not part of the selected integration.");
  }
  if (name.startsWith("SUPABASE_")) {
    throw new Error("Supabase reserves secret names beginning with SUPABASE_.");
  }
}

function assertIntegrationVariableName(id: FullAppIntegrationId, name: string) {
  if (!(FULL_APP_INTEGRATIONS[id].publicVars as readonly string[]).includes(name)) {
    throw new Error("That public variable is not part of the selected integration.");
  }
}

async function listSupabaseSecretNames(accessToken: string, projectRef: string): Promise<string[]> {
  const secretsRes = await supabaseManagement(accessToken, "/v1/projects/" + projectRef + "/secrets");
  if (!secretsRes.ok) {
    throw new Error("Supabase token needs Edge Function Secrets read access.");
  }
  const secretRows = await supabaseJson(secretsRes);
  return Array.isArray(secretRows)
    ? [...new Set(secretRows.map(value =>
        value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string"
          ? (value as { name: string }).name
          : ""
      ).filter(Boolean))].sort()
    : [];
}

function normalizeProductionSiteUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Production Auth Site URL must be a clean HTTPS URL.");
  }
  // GitHub Pages apps may legitimately live under /repo/. Preserve that base path.
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

async function configureSupabaseAuthForSite(
  accessToken: string,
  projectRef: string,
  siteUrl: string,
) {
  const normalized = normalizeProductionSiteUrl(siteUrl);
  const currentRes = await supabaseManagement(accessToken, "/v1/projects/" + projectRef + "/config/auth");
  if (!currentRes.ok) {
    throw new Error("Supabase token needs Auth Config and Project Settings read access.");
  }
  const current = await supabaseJson(currentRes) as {
    site_url?: string | null;
    uri_allow_list?: string | null;
  } | null;

  const existing = String(current?.uri_allow_list ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const wildcard = normalized + "**";
  const redirects = [...new Set([...existing, normalized, wildcard])].slice(0, 100);

  const update = await supabaseManagement(
    accessToken,
    "/v1/projects/" + projectRef + "/config/auth",
    {
      method: "PATCH",
      body: JSON.stringify({
        site_url: normalized,
        uri_allow_list: redirects.join(","),
      }),
    },
  );
  if (!update.ok) {
    throw new Error("Could not update Supabase Auth. The scoped token needs Auth Config and Project Settings read-write access.");
  }
  return {
    siteUrl: normalized,
    redirectCount: redirects.length,
    preservedRedirectCount: existing.length,
  };
}

async function inspectSupabaseProject(accessToken: string, projectRef: string) {
  const [projectRes, keysRes] = await Promise.all([
    supabaseManagement(accessToken, "/v1/projects/" + projectRef),
    supabaseManagement(accessToken, "/v1/projects/" + projectRef + "/api-keys?reveal=true"),
  ]);
  if (!projectRes.ok) {
    throw new Error("Could not access that Supabase project. Check the project ref and use a scoped token with Project Settings read access.");
  }
  if (!keysRes.ok) {
    throw new Error("Supabase token needs API Keys read access to configure the app frontend.");
  }
  const project = await supabaseJson(projectRes) as {
    id?: string; ref?: string; name?: string; status?: string; organization_id?: string;
  } | null;
  const rawKeys = await supabaseJson(keysRes);
  const rows = Array.isArray(rawKeys)
    ? rawKeys
    : rawKeys && typeof rawKeys === "object" && Array.isArray((rawKeys as { keys?: unknown }).keys)
      ? (rawKeys as { keys: unknown[] }).keys
      : [];
  const candidates = rows.filter((value): value is Record<string, unknown> =>
    !!value && typeof value === "object"
  );
  const keyValue = (row: Record<string, unknown>) =>
    typeof row.api_key === "string" ? row.api_key :
    typeof row.key === "string" ? row.key :
    typeof row.value === "string" ? row.value : "";
  const publishable =
    candidates.find(row => keyValue(row).startsWith("sb_publishable_")) ??
    candidates.find(row => String(row.type ?? row.name ?? "").toLowerCase().includes("publishable")) ??
    candidates.find(row => String(row.name ?? "").toLowerCase() === "anon");
  const publishableKey = publishable ? keyValue(publishable) : "";
  if (!publishableKey || publishableKey.length < 15) {
    throw new Error("No enabled publishable/anon API key was returned for that Supabase project.");
  }
  const secretNames = await listSupabaseSecretNames(accessToken, projectRef);
  return {
    projectRef,
    projectName: project?.name ?? projectRef,
    projectStatus: project?.status ?? "unknown",
    organizationId: project?.organization_id ?? "",
    publicUrl: "https://" + projectRef + ".supabase.co",
    publishableKey,
    keyKind: publishableKey.startsWith("sb_publishable_") ? "publishable" : "legacy-anon",
    secretNames: [...new Set(secretNames)].sort(),
  };
}


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
  const managedPaths = Object.keys(files).sort();
  const manifest = JSON.stringify({
    version: 1,
    generatedBy: "Aetheris Obsidian",
    files: [...managedPaths, ".obsidian/managed-files.json"].sort(),
  }, null, 2) + "\n";
  const entries = [
    ...Object.entries(files).map(([path, content]) => ({
      path, mode: "100644", type: "blob", content,
    })),
    {
      path: ".obsidian/managed-files.json",
      mode: "100644",
      type: "blob",
      content: manifest,
    },
  ];
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


const OBSIDIAN_MANIFEST_PATH = ".obsidian/managed-files.json";

async function readManagedManifest(token: string, login: string, repo: string, branch: string): Promise<string[]> {
  const res = await gh(token, "/repos/" + login + "/" + repo + "/contents/" + encodeURIComponent(OBSIDIAN_MANIFEST_PATH) + "?ref=" + encodeURIComponent(branch));
  if (!res.ok) return [];
  try {
    const data = await ghJson(res) as { content?: string; encoding?: string };
    const raw = data.encoding === "base64" && data.content ? fromB64(data.content) : "";
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return [];
    return parsed.files.filter((v): v is string => typeof v === "string" && v.length < 220).slice(0, 500);
  } catch {
    return [];
  }
}

async function syncManagedFullAppFiles(
  token: string,
  login: string,
  repo: string,
  branch: string,
  expectedHeadSha: string | undefined,
  files: Record<string, string>,
  title: string,
) {
  const head = await managedDefaultHead(token, login, repo);
  if (head.branch !== branch) throw new Error("Application default branch changed. Refresh repository status.");
  if (expectedHeadSha && head.sha !== expectedHeadSha) {
    throw new Error("The GitHub app changed since the last inspected build. Refresh status before syncing to avoid overwriting newer work.");
  }

  const parentRes = await gh(token, "/repos/" + login + "/" + repo + "/git/commits/" + head.sha);
  if (!parentRes.ok) throw new Error("Could not read the application repository HEAD.");
  const baseTree = (await ghJson(parentRes)) as { tree: { sha: string } };

  const previousManaged = new Set(await readManagedManifest(token, login, repo, branch));
  const nextManaged = Object.keys(files).sort();
  const nextSet = new Set(nextManaged);
  const tree: Array<{ path: string; mode: string; type: string; content?: string; sha?: null }> = [];

  for (const [filePath, content] of Object.entries(files)) {
    tree.push({ path: filePath, mode: "100644", type: "blob", content });
  }
  for (const stalePath of previousManaged) {
    if (!nextSet.has(stalePath) && stalePath !== OBSIDIAN_MANIFEST_PATH) {
      tree.push({ path: stalePath, mode: "100644", type: "blob", sha: null });
    }
  }
  const manifest = JSON.stringify({
    version: 1,
    generatedBy: "Aetheris Obsidian",
    files: [...nextManaged, OBSIDIAN_MANIFEST_PATH].sort(),
  }, null, 2) + "\n";
  tree.push({ path: OBSIDIAN_MANIFEST_PATH, mode: "100644", type: "blob", content: manifest });

  const treeRes = await gh(token, "/repos/" + login + "/" + repo + "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTree.tree.sha, tree }),
  });
  if (!treeRes.ok) throw new Error("Could not prepare the repaired Full App source tree.");
  const newTree = (await ghJson(treeRes)) as { sha: string };
  const commitRes = await gh(token, "/repos/" + login + "/" + repo + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: "Obsidian repair sync: " + title.slice(0, 100),
      tree: newTree.sha,
      parents: [head.sha],
    }),
  });
  if (!commitRes.ok) throw new Error("Could not create the repaired Full App commit.");
  const commit = (await ghJson(commitRes)) as { sha: string };
  const update = await gh(token, "/repos/" + login + "/" + repo + "/git/refs/heads/" + branch.split("/").map(encodeURIComponent).join("/"), {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  if (!update.ok) throw new Error("Could not update the Full App branch. Refresh before retrying.");
  return commit.sha;
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

function redactDiagnosticLine(line: string): string {
  return line
    .replace(/(authorization:\s*bearer\s+)[^\s]+/ig, "$1[REDACTED]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\b(sb_secret_[A-Za-z0-9_-]{12,}|service_role[A-Za-z0-9._-]{12,})\b/ig, "[REDACTED_SUPABASE_SECRET]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED_API_KEY]")
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/ig, "$1[REDACTED]");
}

function extractUsefulDiagnostics(raw: string): string[] {
  const lines = raw.replace(/\r/g, "").split("\n");
  const strong = /(error|failed|failure|exception|uncaught|cannot find|could not|does not exist|not found|type '.+' is not assignable|expected .+ received|horizontal overflow|should return|should not|timed out|timeout)/i;
  const noise = /^(\s*$|##\[group\]|##\[endgroup\]|download action repository|preparing workflow directory|complete job name)/i;
  const selected: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!strong.test(lines[i] ?? "") || noise.test(lines[i] ?? "")) continue;
    const start = Math.max(0, i - 1);
    const end = Math.min(lines.length, i + 3);
    for (let j = start; j < end; j++) {
      const cleaned = redactDiagnosticLine((lines[j] ?? "").trim()).slice(0, 700);
      if (cleaned && !selected.includes(cleaned)) selected.push(cleaned);
      if (selected.length >= 40) return selected;
    }
  }
  return selected.slice(0, 40);
}

async function managedRunDiagnostics(token: string, login: string, repo: string, runId: number) {
  const runRes = await gh(token, "/repos/" + login + "/" + repo + "/actions/runs/" + runId);
  if (!runRes.ok) throw new Error("Could not inspect that build run.");
  const run = await ghJson(runRes) as {
    id: number; name?: string; path?: string; status?: string; conclusion?: string | null;
    head_sha?: string; html_url?: string;
  };
  const allowedWorkflow =
    run.path?.endsWith("/obsidian-build.yml") ||
    run.path?.endsWith("/obsidian-ship.yml") ||
    run.name === "Obsidian Full App build" ||
    run.name === "Obsidian Ship";
  if (!allowedWorkflow) throw new Error("Diagnostics are only available for Obsidian Full App build/ship workflows.");

  const jobsRes = await gh(token, "/repos/" + login + "/" + repo + "/actions/runs/" + runId + "/jobs?per_page=30");
  if (!jobsRes.ok) throw new Error("Could not inspect failed build jobs.");
  const jobs = await ghJson(jobsRes) as { jobs?: Array<{
    id: number; name: string; status: string; conclusion: string | null;
    steps?: Array<{ name: string; status: string; conclusion: string | null; number: number }>;
  }> };
  const failed = (jobs.jobs ?? []).filter(job => job.conclusion && job.conclusion !== "success" && job.conclusion !== "skipped");
  const diagnostics: string[] = [];
  const failedSteps: string[] = [];

  for (const job of failed.slice(0, 4)) {
    for (const step of job.steps ?? []) {
      if (step.conclusion && step.conclusion !== "success" && step.conclusion !== "skipped") {
        failedSteps.push(job.name + " / " + step.name + " (" + step.conclusion + ")");
      }
    }
    const logRes = await gh(token, "/repos/" + login + "/" + repo + "/actions/jobs/" + job.id + "/logs", {
      headers: { Accept: "text/plain" },
    });
    if (!logRes.ok) continue;
    const text = (await logRes.text()).slice(-120_000);
    for (const line of extractUsefulDiagnostics(text)) {
      if (!diagnostics.includes(line)) diagnostics.push(line);
      if (diagnostics.length >= 60) break;
    }
  }

  return {
    runId: run.id,
    workflow: run.name ?? "Obsidian build",
    status: run.status ?? "unknown",
    conclusion: run.conclusion ?? null,
    headSha: run.head_sha ?? "",
    url: run.html_url ?? "",
    failedSteps: failedSteps.slice(0, 20),
    diagnostics: diagnostics.slice(0, 60),
  };
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

async function backendReadiness(
  token: string,
  login: string,
  repo: string,
  integrations: FullAppIntegrationId[] = [],
  supabaseSecretNames?: ReadonlySet<string>,
) {
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
  const runtimeSecretNames = supabaseSecretNames ?? new Set<string>();
  const requiredIntegrationSecrets = integrationSecretNames(integrations);
  const requiredIntegrationVariables = integrationPublicVariableNames(integrations);
  const integrationStatus = integrations.map(id => {
    const def = FULL_APP_INTEGRATIONS[id];
    const missingSecrets = def.secrets.filter(name => !runtimeSecretNames.has(name));
    const missingVariables = def.publicVars.filter(name => !variableNames.has(name));
    return {
      id,
      label: def.label,
      purpose: def.purpose,
      ready: missingSecrets.length === 0 && missingVariables.length === 0,
      requiredSecrets: [...def.secrets],
      requiredVariables: [...def.publicVars],
      missingSecrets,
      missingVariables,
    };
  });
  return {
    hasAccessToken: secretNames.has("SUPABASE_ACCESS_TOKEN"),
    hasDbPassword: secretNames.has("SUPABASE_DB_PASSWORD"),
    hasProjectRef: variableNames.has("SUPABASE_PROJECT_REF"),
    hasOrgId: variableNames.has("SUPABASE_ORG_ID"),
    hasPublicUrl: variableNames.has("VITE_SUPABASE_URL"),
    hasPublicKey: variableNames.has("VITE_SUPABASE_PUBLISHABLE_KEY"),
    requiredIntegrationSecrets,
    requiredIntegrationVariables,
    supabaseSecretsVerified: supabaseSecretNames !== undefined,
    missingIntegrationSecrets: requiredIntegrationSecrets.filter(name => !runtimeSecretNames.has(name)),
    missingIntegrationVariables: requiredIntegrationVariables.filter(name => !variableNames.has(name)),
    integrations: integrationStatus,
  };
}


async function rollbackToSuccessfulShip(
  token: string,
  login: string,
  repo: string,
  runId: number,
) {
  const runRes = await gh(token, "/repos/" + login + "/" + repo + "/actions/runs/" + runId);
  if (!runRes.ok) throw new Error("Could not inspect that release run.");
  const run = await ghJson(runRes) as {
    id: number;
    name?: string;
    path?: string;
    conclusion?: string | null;
    head_sha?: string;
  };
  const isShip =
    run.path?.endsWith("/obsidian-ship.yml") ||
    run.name === "Obsidian Ship";
  if (!isShip || run.conclusion !== "success" || !run.head_sha || !/^[0-9a-f]{40}$/i.test(run.head_sha)) {
    throw new Error("Rollback is allowed only to a previously successful Obsidian Ship run.");
  }

  const targetCommitRes = await gh(token, "/repos/" + login + "/" + repo + "/git/commits/" + run.head_sha);
  if (!targetCommitRes.ok) throw new Error("Could not read the selected known-good release.");
  const targetCommit = await ghJson(targetCommitRes) as { tree: { sha: string } };

  const current = await managedDefaultHead(token, login, repo);
  if (current.sha === run.head_sha) {
    throw new Error("The selected release is already the current source revision.");
  }

  const rollbackCommitRes = await gh(token, "/repos/" + login + "/" + repo + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: "Obsidian rollback to verified release " + run.head_sha.slice(0, 7),
      tree: targetCommit.tree.sha,
      parents: [current.sha],
    }),
  });
  if (!rollbackCommitRes.ok) throw new Error("Could not create the rollback commit.");
  const rollbackCommit = await ghJson(rollbackCommitRes) as { sha: string };

  const refUpdate = await gh(
    token,
    "/repos/" + login + "/" + repo + "/git/refs/heads/" + current.branch.split("/").map(encodeURIComponent).join("/"),
    {
      method: "PATCH",
      body: JSON.stringify({ sha: rollbackCommit.sha, force: false }),
    },
  );
  if (!refUpdate.ok) throw new Error("Could not move the application branch to the rollback commit.");

  await initializeManagedPages(token, login, repo);
  await workflowDispatch(token, login, repo, "obsidian-ship.yml");

  return {
    sourceRunId: run.id,
    sourceSha: run.head_sha,
    rollbackSha: rollbackCommit.sha,
  };
}


function normalizeCustomDomain(raw: string): string {
  const domain = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!/^(?=.{3,63}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Enter a valid custom domain such as app.example.com.");
  }
  return domain;
}

async function managedPagesDomainStatus(token: string, login: string, repo: string) {
  const pageRes = await gh(token, "/repos/" + login + "/" + repo + "/pages");
  if (!pageRes.ok) throw new Error("GitHub Pages is not enabled for this application.");
  const page = await ghJson(pageRes) as {
    html_url?: string;
    cname?: string | null;
    https_enforced?: boolean;
    status?: string;
  };

  const healthRes = await gh(token, "/repos/" + login + "/" + repo + "/pages/health");
  let health: unknown = null;
  let healthPending = false;
  if (healthRes.status === 202) {
    healthPending = true;
  } else if (healthRes.ok) {
    health = await ghJson(healthRes);
  }
  return {
    url: page.html_url ?? "",
    domain: page.cname ?? "",
    httpsEnforced: !!page.https_enforced,
    status: page.status ?? "unknown",
    healthPending,
    health,
  };
}

async function setManagedPagesDomain(token: string, login: string, repo: string, rawDomain: string) {
  const domain = normalizeCustomDomain(rawDomain);
  await initializeManagedPages(token, login, repo);
  const update = await gh(token, "/repos/" + login + "/" + repo + "/pages", {
    method: "PUT",
    body: JSON.stringify({ cname: domain, build_type: "workflow" }),
  });
  if (!update.ok) {
    const body = await update.text();
    throw new Error("Could not set the GitHub Pages custom domain (" + update.status + "): " + body.slice(0, 160));
  }

  const current = await managedPagesDomainStatus(token, login, repo);
  const domainHealth = current.health && typeof current.health === "object"
    ? (current.health as { domain?: { is_valid?: boolean; is_https_eligible?: boolean; enforces_https?: boolean } }).domain
    : undefined;

  if (domainHealth?.is_valid && domainHealth.is_https_eligible && !domainHealth.enforces_https) {
    const https = await gh(token, "/repos/" + login + "/" + repo + "/pages", {
      method: "PUT",
      body: JSON.stringify({ cname: domain, https_enforced: true, build_type: "workflow" }),
    });
    if (https.ok) return managedPagesDomainStatus(token, login, repo);
  }
  return current;
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

          if (parsed.action === "buildStatus" || parsed.action === "buildDiagnostics" || parsed.action === "triggerBuild" || parsed.action === "triggerHealth" || parsed.action === "triggerBackendHealth" || parsed.action === "syncFullApp" ||
              parsed.action === "publishApp" || parsed.action === "shipApp" || parsed.action === "setCustomDomain" || parsed.action === "customDomainStatus" || parsed.action === "rollbackApp" || parsed.action === "configureAppBackend" ||
              parsed.action === "backendStatus" || parsed.action === "deployBackend" || parsed.action === "provisionBackend" ||
              parsed.action === "connectSupabaseBackend" || parsed.action === "setSupabaseSecret" ||
              parsed.action === "deleteSupabaseSecret" || parsed.action === "setIntegrationVariable" ||
              parsed.action === "configureSupabaseAuth") {
            const user = await getUser(parsed.token);
            const appRepo = await managedAppRepo(parsed.token, user.login, parsed.repo);
            if (parsed.action === "connectSupabaseBackend") {
              const backend = await inspectSupabaseProject(parsed.supabaseAccessToken, parsed.projectRef);
              await setPublicRepoVariable(parsed.token, user.login, appRepo, "SUPABASE_PROJECT_REF", backend.projectRef);
              await setPublicRepoVariable(parsed.token, user.login, appRepo, "VITE_SUPABASE_URL", backend.publicUrl);
              await setPublicRepoVariable(parsed.token, user.login, appRepo, "VITE_SUPABASE_PUBLISHABLE_KEY", backend.publishableKey);
              return Response.json({
                ok: true,
                backend: {
                  projectRef: backend.projectRef,
                  projectName: backend.projectName,
                  projectStatus: backend.projectStatus,
                  publicUrl: backend.publicUrl,
                  keyKind: backend.keyKind,
                  secretNames: backend.secretNames,
                },
                message: "Supabase project connected. Public app configuration was saved to GitHub variables; the management token was not stored.",
              });
            }
            if (parsed.action === "setSupabaseSecret") {
              assertIntegrationSecretName(parsed.integration, parsed.name);
              const write = await supabaseManagement(
                parsed.supabaseAccessToken,
                "/v1/projects/" + parsed.projectRef + "/secrets",
                {
                  method: "POST",
                  body: JSON.stringify([{ name: parsed.name, value: parsed.value }]),
                },
              );
              if (!write.ok) {
                throw new Error("Could not save the Supabase runtime secret. Check Edge Function Secrets write permission.");
              }
              const secretNames = await listSupabaseSecretNames(parsed.supabaseAccessToken, parsed.projectRef);
              return Response.json({
                ok: true,
                secretNames,
                message: parsed.name + " saved in the app's Supabase Function secrets. Obsidian did not persist the value.",
              });
            }
            if (parsed.action === "deleteSupabaseSecret") {
              assertIntegrationSecretName(parsed.integration, parsed.name);
              const remove = await supabaseManagement(
                parsed.supabaseAccessToken,
                "/v1/projects/" + parsed.projectRef + "/secrets",
                {
                  method: "DELETE",
                  body: JSON.stringify([parsed.name]),
                },
              );
              if (!remove.ok) {
                throw new Error("Could not delete the Supabase runtime secret.");
              }
              const secretNames = await listSupabaseSecretNames(parsed.supabaseAccessToken, parsed.projectRef);
              return Response.json({ ok: true, secretNames, message: parsed.name + " removed from the app runtime." });
            }
            if (parsed.action === "setIntegrationVariable") {
              assertIntegrationVariableName(parsed.integration, parsed.name);
              await setPublicRepoVariable(parsed.token, user.login, appRepo, parsed.name, parsed.value);
              return Response.json({ ok: true, message: parsed.name + " saved as a public GitHub Actions variable." });
            }
            if (parsed.action === "configureSupabaseAuth") {
              const auth = await configureSupabaseAuthForSite(
                parsed.supabaseAccessToken,
                parsed.projectRef,
                parsed.siteUrl,
              );
              return Response.json({
                ok: true,
                auth,
                message: "Supabase Auth Site URL and redirect allow-list updated without removing existing redirects.",
              });
            }

            if (parsed.action === "backendStatus" || parsed.action === "deployBackend") {
              let runtimeSecrets: Set<string> | undefined;
              if (parsed.supabaseAccessToken || parsed.projectRef) {
                if (!parsed.supabaseAccessToken || !parsed.projectRef) {
                  throw new Error("Provide both Supabase project ref and management token to verify runtime secrets.");
                }
                runtimeSecrets = new Set(
                  await listSupabaseSecretNames(parsed.supabaseAccessToken, parsed.projectRef)
                );
              }
              const readiness = await backendReadiness(
                parsed.token,
                user.login,
                appRepo,
                parsed.integrations,
                runtimeSecrets,
              );
              if (parsed.action === "backendStatus") {
                const [runs, healthRuns] = await Promise.all([
                  managedRunStatus(parsed.token, user.login, appRepo, "obsidian-backend.yml"),
                  managedRunStatus(parsed.token, user.login, appRepo, "obsidian-backend-health.yml").catch(() => []),
                ]);
                return Response.json({ ok: true, readiness, runs, healthRuns });
              }
              if (!readiness.hasAccessToken || !readiness.hasProjectRef ||
                  (parsed.mode === "schema-and-functions" && !readiness.hasDbPassword) ||
                  readiness.missingIntegrationSecrets.length > 0 ||
                  readiness.missingIntegrationVariables.length > 0) {
                const missing = [
                  ...readiness.missingIntegrationSecrets,
                  ...readiness.missingIntegrationVariables,
                ];
                throw new Error(
                  "Backend is not production-ready. Configure the app's Supabase deployment credentials" +
                  (missing.length ? " and missing integration settings: " + missing.join(", ") : "") +
                  "."
                );
              }
              // The caller must explicitly type approval, GitHub Actions repeats
              // the check, and the production-backend environment may require reviewers.
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-backend.yml", {
                mode: parsed.mode, approval: parsed.approval,
              });
              return Response.json({ ok: true, status: "queued", message:
                "Backend deployment requested. Review GitHub Actions and production-backend approval before using live data." });
            }
            if (parsed.action === "provisionBackend") {
              throw new Error(
                "Automatic Supabase project creation is disabled until Obsidian can show the live organization-specific cost and receive explicit cost confirmation. Connect an existing project instead."
              );
            }

            if (parsed.action === "setCustomDomain") {
              const domain = await setManagedPagesDomain(parsed.token, user.login, appRepo, parsed.domain);
              return Response.json({
                ok: true,
                domain,
                message: domain.httpsEnforced
                  ? "Custom domain configured and HTTPS enforced."
                  : "Custom domain saved. GitHub is waiting for DNS/HTTPS eligibility; check domain status after DNS propagates.",
              });
            }
            if (parsed.action === "customDomainStatus") {
              const domain = await managedPagesDomainStatus(parsed.token, user.login, appRepo);
              return Response.json({ ok: true, domain });
            }

            if (parsed.action === "buildDiagnostics") {
              const diagnostics = await managedRunDiagnostics(parsed.token, user.login, appRepo, parsed.runId);
              return Response.json({ ok: true, diagnostics });
            }
            if (parsed.action === "buildStatus") {
              const [builds, publishes, ships, health] = await Promise.all([
                managedRunStatus(parsed.token, user.login, appRepo, "obsidian-build.yml"),
                managedRunStatus(parsed.token, user.login, appRepo, "obsidian-publish.yml"),
                managedRunStatus(parsed.token, user.login, appRepo, "obsidian-ship.yml").catch(() => []),
                managedRunStatus(parsed.token, user.login, appRepo, "obsidian-health.yml").catch(() => []),
              ]);
              return Response.json({ ok: true, repo: appRepo, builds, publishes, ships, health });
            }
            if (parsed.action === "triggerBuild") {
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-build.yml");
              return Response.json({ ok: true, status: "queued", message: "Build + browser QA requested. Refresh status to see the run." });
            }
            if (parsed.action === "triggerHealth") {
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-health.yml");
              return Response.json({ ok: true, status: "queued", message: "Live production health check queued." });
            }
            if (parsed.action === "triggerBackendHealth") {
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-backend-health.yml");
              return Response.json({ ok: true, status: "queued", message: "Backend production health check queued." });
            }
            if (parsed.action === "syncFullApp") {
              const artifact = buildArtifact({ html: parsed.html, surface: "publish" });
              if (!artifact.safeToPublish) throw new Error("The current Full App design did not pass the publish safety gate.");
              const nextFiles = reconcileFullAppFiles(
                artifact.html,
                parsed.title,
                parsed.files,
                validateAppAddons(parsed.addons),
              );
              const { branch, sha: currentSha } = await managedDefaultHead(parsed.token, user.login, appRepo);
              const nextSha = await syncManagedFullAppFiles(
                parsed.token,
                user.login,
                appRepo,
                branch,
                parsed.expectedHeadSha,
                nextFiles,
                parsed.title,
              );
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-build.yml");
              return Response.json({
                ok: true,
                status: "queued",
                previousSha: currentSha,
                headSha: nextSha,
                message: "Repaired source synced to GitHub. Build + browser QA queued automatically.",
              });
            }
            if (parsed.action === "shipApp") {
              await initializeManagedPages(parsed.token, user.login, appRepo);
              await workflowDispatch(parsed.token, user.login, appRepo, "obsidian-ship.yml");
              return Response.json({
                ok: true,
                status: "queued",
                url: "https://" + user.login.toLowerCase() + ".github.io/" + appRepo + "/",
                message: "Obsidian Ship queued. The app will publish only if production build and browser QA both pass.",
              });
            }
            if (parsed.action === "rollbackApp") {
              const rollback = await rollbackToSuccessfulShip(
                parsed.token,
                user.login,
                appRepo,
                parsed.runId,
              );
              return Response.json({
                ok: true,
                status: "queued",
                ...rollback,
                url: "https://" + user.login.toLowerCase() + ".github.io/" + appRepo + "/",
                message: "Rollback commit created from the verified release. Build + QA + Ship is running. Backend/database state was not changed.",
              });
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
