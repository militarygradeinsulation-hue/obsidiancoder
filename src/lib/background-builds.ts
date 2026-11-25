import { idbGet, idbSet } from "./idb-storage";

export type BackgroundBuildJob = {
  sessionId: string;
  operationId: string;
  prompt: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  finishedAt?: number;
  html?: string;
  message?: string;
  serverJobId?: string;
};

const KEY = "obs.background-builds.v1";
const MAX_JOBS = 24;
const MAX_HTML = 1_500_000;

async function readJobs(): Promise<BackgroundBuildJob[]> {
  const raw = await idbGet<BackgroundBuildJob[]>(KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((j) => j && typeof j.sessionId === "string" && typeof j.operationId === "string")
    .slice(0, MAX_JOBS);
}

async function writeJobs(jobs: BackgroundBuildJob[]) {
  await idbSet(KEY, jobs.slice(0, MAX_JOBS));
}

export async function beginBackgroundBuild(input: {
  sessionId: string;
  operationId: string;
  prompt: string;
}) {
  const jobs = await readJobs();
  const next: BackgroundBuildJob = {
    sessionId: input.sessionId,
    operationId: input.operationId,
    prompt: input.prompt.slice(0, 600),
    status: "running",
    startedAt: Date.now(),
  };
  await writeJobs([next, ...jobs.filter((j) => j.operationId !== input.operationId)]);
}

export async function completeBackgroundBuild(
  sessionId: string,
  operationId: string,
  html: string,
  message = "Background build completed.",
) {
  const jobs = await readJobs();
  const current = jobs.find((j) => j.operationId === operationId);
  const next: BackgroundBuildJob = {
    sessionId,
    operationId,
    prompt: current?.prompt ?? "",
    status: "completed",
    startedAt: current?.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    html: html.slice(0, MAX_HTML),
    message: message.slice(0, 240),
    serverJobId: current?.serverJobId,
  };
  await writeJobs([next, ...jobs.filter((j) => j.operationId !== operationId)]);
}

export async function failBackgroundBuild(sessionId: string, operationId: string, message: string) {
  const jobs = await readJobs();
  const current = jobs.find((j) => j.operationId === operationId);
  const next: BackgroundBuildJob = {
    sessionId,
    operationId,
    prompt: current?.prompt ?? "",
    status: "failed",
    startedAt: current?.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    message: message.slice(0, 240),
    serverJobId: current?.serverJobId,
  };
  await writeJobs([next, ...jobs.filter((j) => j.operationId !== operationId)]);
}

export async function completedBackgroundBuilds(): Promise<BackgroundBuildJob[]> {
  return (await readJobs()).filter((j) => j.status === "completed" && !!j.html);
}

export async function markBackgroundBuildApplied(operationId: string): Promise<void> {
  const jobs = await readJobs();
  await writeJobs(jobs.filter((j) => j.operationId !== operationId));
}

export async function attachServerJob(operationId: string, serverJobId: string): Promise<void> {
  const jobs = await readJobs();
  await writeJobs(jobs.map((job) =>
    job.operationId === operationId ? { ...job, serverJobId } : job
  ));
}

export async function recoverableBackgroundBuilds(): Promise<BackgroundBuildJob[]> {
  return (await readJobs()).filter(
    (job) => job.status === "running" && typeof job.serverJobId === "string" && job.serverJobId.length > 10,
  );
}
