// Pure, deterministic project-continuity helpers.
// Never send saved user notes to an AI model automatically. Copying a brief is an explicit user action.
import type { BrainRecord, BrainRecordKind } from "./brain-cloud";

type KnowledgeKind = Exclude<BrainRecordKind, "learning">;
export type KnowledgeFilter = "all" | KnowledgeKind;

export function projectKnowledge(records: readonly BrainRecord[], projectKey: string, query = "", filter: KnowledgeFilter = "all"): BrainRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  return records.filter((r) =>
    r.kind !== "learning" &&
    r.deleted_at === null &&
    (r.project_key === "global" || r.project_key === projectKey) &&
    (filter === "all" || r.kind === filter) &&
    (!needle || `${r.title} ${r.body}`.toLocaleLowerCase().includes(needle))
  ).sort((a, b) => b.updated_at - a.updated_at);
}

export function reviseBrainRecord(record: BrainRecord, title: string, body: string, at = Date.now()): BrainRecord {
  if (record.deleted_at !== null || record.kind === "learning") return record;
  const nextTitle = title.trim().slice(0, 120);
  const nextBody = body.trim().slice(0, 4000);
  if (!nextTitle || !nextBody || (nextTitle === record.title && nextBody === record.body)) return record;
  return { ...record, title: nextTitle, body: nextBody, updated_at: Math.max(at, record.updated_at + 1) };
}

export function projectResumeBrief(records: readonly BrainRecord[], projectKey: string, projectTitle = "Current project", maxChars = 2400): string {
  const scoped = projectKnowledge(records, projectKey);
  const project = scoped.filter((r) => projectKey !== "global" && r.project_key === projectKey);
  const general = scoped.filter((r) => r.project_key === "global");
  const selected = [...project, ...general].slice(0, 16);
  const heading = `PROJECT CONTINUITY BRIEF\nProject: ${projectTitle.trim().slice(0, 100) || "Current project"}\n\n`;
  const limit = Math.max(heading.length, maxChars);
  let out = heading;
  for (const r of selected) {
    const line = `[${r.kind.toUpperCase()}] ${r.title}: ${r.body.replace(/\s+/g, " ").trim()}\n`;
    if (out.length + line.length > limit) {
      const remaining = limit - out.length;
      if (remaining >= 80) out += line.slice(0, remaining - 1) + "\n";
      break;
    }
    out += line;
  }
  return out.trimEnd();
}
