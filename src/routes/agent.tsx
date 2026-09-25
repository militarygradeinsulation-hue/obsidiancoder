import * as React from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Circle, CheckCircle2 } from "lucide-react";
import { ObsidianModeNav } from "@/components/ObsidianModeNav";
import { decomposeMission, missionToStudioPrompt } from "@/lib/agent-mission";
import { readCurrentProject, stageMissionHandoff, type CurrentProject } from "@/lib/current-project";

export const Route = createFileRoute("/agent")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    const { unlocked } = await ensureUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Obsidian Agent — mission control for your project" },
      { name: "description", content: "Describe an outcome. Obsidian breaks it into roles, shows what can run today, and sends the mission to Studio on the same project." },
      { property: "og:title", content: "Obsidian Agent — mission control" },
      { property: "og:description", content: "Delegate outcomes; Obsidian picks the capabilities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentPage,
});

const EXAMPLE = "Audit this app, fix mobile issues, test forms, and prepare it for production.";

function AgentPage() {
  const navigate = useNavigate();
  const [mission, setMission] = React.useState("");
  const [project, setProject] = React.useState<CurrentProject | null>(null);
  React.useEffect(() => setProject(readCurrentProject()), []);
  const steps = React.useMemo(() => decomposeMission(mission), [mission]);
  const runnable = steps.filter((s) => s.available);

  function sendToStudio() {
    if (!steps.length) return;
    stageMissionHandoff(missionToStudioPrompt(mission, steps));
    void navigate({ to: "/" });
  }

  return (
    <div className="obs-page">
      <header className="obs-page-top">
        <span className="obs-display text-2xl" style={{ color: "var(--obs-orange)" }}>Obsidian</span>
        <ObsidianModeNav showProject />
      </header>
      <main className="obs-page-wrap">
        <p className="obs-kicker">Agent · mission control</p>
        <h1 className="obs-display mt-2 text-5xl sm:text-7xl">Delegate the outcome</h1>
        <p className="mt-3 max-w-2xl text-sm opacity-70">
          {project
            ? <>Working on <b>{project.title}</b> — the same project, memory and Brain as Pocket and Studio.</>
            : <>No project open yet. Missions run on whatever project you open in Studio.</>}
        </p>

        <div className="mt-8 obs-node">
          <label htmlFor="mission" className="obs-kicker">Mission</label>
          <textarea id="mission" className="obs-textarea mt-2" placeholder={EXAMPLE} value={mission} onChange={(e) => setMission(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="obs-btn-primary" disabled={!steps.length} onClick={sendToStudio}>
              Send to Studio <ArrowRight size={14} />
            </button>
            {!mission && <button type="button" className="obs-btn-ghost" onClick={() => setMission(EXAMPLE)}>Try an example</button>}
            <span className="text-xs opacity-60">Studio receives one patch-first prompt covering the steps it can run today. You review and send it.</span>
          </div>
        </div>

        {steps.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="obs-kicker">Mission plan · {steps.length} roles</h2>
              <span className="text-xs opacity-60">{runnable.length} available now · {steps.length - runnable.length} not connected</span>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {steps.map((s, i) => (
                <li key={s.role} className="obs-node" data-live={s.available ? "true" : "false"} style={s.available ? undefined : { opacity: 0.6 }}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="opacity-50">{String(i + 1).padStart(2, "0")}</span> {s.role}
                    </span>
                    <span className="obs-pill" data-tone={s.available ? "good" : "muted"}>
                      {s.available ? <><CheckCircle2 size={11} /> Available now</> : <><Circle size={11} /> Future</>}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{s.task}</p>
                  <p className="mt-1 text-xs opacity-60">{s.capability} · {s.reason}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}
