import { authFetch } from "./auth-fetch";
import { safeGet, safeSet } from "./safe-storage";
export type PendingBuild = { jobId: string; accessToken?: string; scope: string; startedAt: number };
const KEY = "obs.pendingBuilds.v2";
export const pendingBuilds = (): PendingBuild[] => safeGet<PendingBuild[]>(KEY) ?? [];
function remember(job: PendingBuild) {
  if (!safeSet(KEY, [...pendingBuilds().filter(j => j.scope !== job.scope), job]))
    throw new Error("Could not save the background build reference. Enable browser storage before building.");
}
export function forgetBuild(id: string) { safeSet(KEY, pendingBuilds().filter(j => j.jobId !== id)); }
export async function readBuild(job: PendingBuild) {
  return authFetch("/api/jobs/" + job.jobId, { headers: job.accessToken ? { "x-obs-job-token": job.accessToken } : {} });
}
export async function stopBuild(scope: string) {
  const job = pendingBuilds().find(j => j.scope === scope);
  if (!job) return;
  const res = await authFetch("/api/jobs/" + job.jobId, { method: "DELETE", headers: job.accessToken ? { "x-obs-job-token": job.accessToken } : {} });
  if (res.ok) forgetBuild(job.jobId);
}
export async function generateDurably(body: Record<string, unknown>, init: RequestInit, scope: string): Promise<Response> {
  // Advisory chat and one-shot demos retain their existing gate and streaming transport.
  const headers = new Headers(init.headers);
  if (body.advisory || headers.get("x-obs-demo") === "1")
    return authFetch("/api/generate", { ...init, body: JSON.stringify(body) });
  if (pendingBuilds().some(j => j.scope === scope))
    throw new Error("This project already has a background build. Return to it or stop it before starting another.");
  const created = await authFetch("/api/jobs/create", { method: "POST", headers, body: JSON.stringify(body) });
  if (!created.ok) return created;
  const { jobId, accessToken } = await created.json() as { jobId: string; accessToken?: string };
  const job = { jobId, accessToken, scope, startedAt: Date.now() };
  remember(job);
  for (;;) {
    // Detaching a viewer does not cancel server work. Stop is an explicit DELETE.
    if (init.signal?.aborted) throw new DOMException("Viewer detached; build continues in background.", "AbortError");
    const res = await readBuild(job);
    if (!res.ok) throw new Error("Build continues in the background. Reopen this project to reconnect.");
    const out = await res.json() as { status: string; resultHtml?: string; servedModel?: string; error?: string; responsePayload?: unknown };
    if (out.status === "complete" && out.resultHtml) {
      // The UI acknowledges only after saving; navigation must not lose the pointer.
      if (body.task === "patch" && out.responsePayload) return Response.json(out.responsePayload);
      return new Response(out.resultHtml, { headers: { "content-type": "text/html", "x-obs-model-used": out.servedModel ?? "" } });
    }
    if (out.status === "failed" || out.status === "cancelled") {
      forgetBuild(jobId);
      throw new Error(out.error || "Build stopped.");
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
