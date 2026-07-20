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

export const Route = createFileRoute("/api/github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let entitlement: EntitlementResult | null = null;
        let committed = false;
        try {
          const parsed = bodySchema.parse(await request.json());

          // ALL GitHub actions require paid entitlement (owner or active Pro).
          // Only `deploy` charges credits; verify/listRepos/import are free
          // reads for the entitled user — but the entitlement check itself
          // must pass first to block free-tier callers.
          if (parsed.action === "deploy") {
            entitlement = await requirePaidOperation(request, "github_deploy");
            if (entitlement.kind === "denied" && entitlement.denial) {
              return denialResponse(entitlement.denial);
            }
          } else {
            // Owner cookie → allow. Otherwise require active Pro (no charge).
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
          // deploy
          const user = await getUser(parsed.token);
          const name = slugify(parsed.repo);
          const repoInfo = await ensureRepo(parsed.token, user.login, name, parsed.isPrivate);
          const branch = repoInfo.default_branch || "main";
          const title = parsed.title || name;
          const readme = `# ${title}\n\nBuilt with **Aetheris Obsidian** — https://obsidiancoder.lovable.app\n\nOpen \`index.html\` locally or view the live GitHub Pages URL.\n`;
          await putFile(parsed.token, user.login, name, "index.html", parsed.html, `Deploy: ${title}`, branch);
          await putFile(parsed.token, user.login, name, "README.md", readme, "Add README", branch);
          let pages: { html_url: string; alreadyEnabled: boolean } | null = null;
          if (parsed.enablePages) {
            try {
              pages = await enablePages(parsed.token, user.login, name, branch);
            } catch (e) {
              pages = null;
            }
          }
          // Commit the deploy charge.
          const ent = entitlement as EntitlementResult | null;
          if (ent?.kind === "pro" && ent.reservation) {
            committed = true;
            await commitReservation(ent.reservation.reservationId);
          } else if (ent?.kind === "owner") {
            committed = true;
            await logOwnerUsage("github_deploy", 0);
          }
          return Response.json({
            ok: true,
            user: { login: user.login },
            repo: { name, full_name: `${user.login}/${name}`, html_url: `https://github.com/${user.login}/${name}` },
            pages,
          });
        } catch (err) {
          const ent = entitlement as EntitlementResult | null;
          if (!committed && ent?.kind === "pro" && ent.reservation) {
            committed = true;
            await refundReservation(ent.reservation.reservationId);
          }
          const msg = err instanceof Error ? err.message : "GitHub request failed.";
          return Response.json({ error: msg }, { status: 400 });
        }
      },
    },
  },
});
