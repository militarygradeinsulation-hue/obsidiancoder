// Intelligence panel — shows current interpretation, applied preferences,
// strategy recommendation, last operation provenance, and recent learning.
// All data is local.

import * as React from "react";
import { loadProfile, type AdaptiveProfile } from "@/lib/adaptive-profile";
import type { ResolvedIntent } from "@/lib/intent-resolver";
import type { RoutingDecision } from "@/lib/adaptive-router";
import type { OperationSummary } from "@/lib/operation-tracker";
import { learnedBias, readBuildLearning, scoreOf, topExemplars, type BuildLearningEntry } from "@/lib/build-learning";

interface Props {
  intent?: ResolvedIntent;
  decision?: RoutingDecision;
  lastOperation?: OperationSummary;
  refreshKey?: number;
  libraryCode?: string;
}

const outcomeColor: Record<OperationSummary["outcome"], string> = {
  pending: "#c9953d",
  ok: "#7bd88f",
  fail: "#ff6b6b",
  restored: "#c9953d",
  rejected: "#ff6b6b",
};

export function IntelligencePanel({ intent, decision, lastOperation, refreshKey = 0, libraryCode }: Props) {
  const [profile, setProfile] = React.useState<AdaptiveProfile | null>(null);
  const [learning, setLearning] = React.useState<readonly BuildLearningEntry[]>([]);

  React.useEffect(() => {
    setProfile(loadProfile());
    setLearning(readBuildLearning(libraryCode).entries);
  }, [refreshKey, libraryCode]);

  const bias = React.useMemo(() => learnedBias(learning), [learning]);
  const best = React.useMemo(() => topExemplars(learning, undefined, 3), [learning]);
  const avgScore = learning.length
    ? Math.round(learning.reduce((a, e) => a + scoreOf(e), 0) / learning.length)
    : null;

  return (
    <div className="obs-card" id="rail-intelligence" data-testid="intelligence-panel">
      <div className="obs-card-head">
        <span>Intelligence</span>
        <span className="obs-card-meta">{profile?.applied.length ?? 0} learned · {profile?.recentEvents.length ?? 0} recent</span>
      </div>
      <div className="obs-card-body" style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
        <section>
          <div style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>Interpretation</div>
          {intent ? (
            <div>
              <div>{intent.outcome.slice(0, 90)}</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>
                scope: {intent.scope} · risk: {intent.risk} · ambiguity: {intent.ambiguity.toFixed(2)}
                {intent.needsClarification && <span style={{ color: "#c9953d" }}> · asks clarifying question</span>}
              </div>
              {intent.likelyTargets.length > 0 && (
                <div style={{ opacity: 0.7, marginTop: 2 }}>targets: {intent.likelyTargets.slice(0, 4).join(", ")}</div>
              )}
            </div>
          ) : <div style={{ opacity: 0.5 }}>No pending request.</div>}
        </section>
        <section>
          <div style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>Strategy</div>
          {decision ? (
            <div>
              <div>{decision.chosenStrategy} · {decision.chosenModel}{decision.explicitOverride ? " (explicit)" : ""}</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>{decision.why}</div>
              {decision.signalsUsed.length > 0 && (
                <div style={{ opacity: 0.7, marginTop: 2 }}>signals: {decision.signalsUsed.join(", ")}</div>
              )}
            </div>
          ) : <div style={{ opacity: 0.5 }}>No routing decision yet.</div>}
        </section>
        <section data-testid="intelligence-last-op">
          <div style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>Last operation</div>
          {lastOperation ? (
            <div>
              <div>
                <span style={{ color: outcomeColor[lastOperation.outcome], fontWeight: 600 }}>●</span>{" "}
                {lastOperation.outcome} · {lastOperation.strategy}
                {lastOperation.durationMs != null && <span style={{ opacity: 0.7 }}> · {Math.round(lastOperation.durationMs)}ms</span>}
              </div>
              <div style={{ opacity: 0.7, marginTop: 2 }}>
                model: {lastOperation.requestedModel}
                {lastOperation.actualModel && lastOperation.actualModel !== lastOperation.requestedModel && <> → <b>{lastOperation.actualModel}</b></>}
              </div>
              {lastOperation.providerChain.length > 0 && (
                <div style={{ opacity: 0.7, marginTop: 2 }}>fallback: {lastOperation.providerChain.join(" → ")}</div>
              )}
              {(lastOperation.imageCount ?? 0) > 0 && (
                <div style={{ opacity: 0.7, marginTop: 2 }}>images: {lastOperation.imageCount} · {lastOperation.imageProviders}</div>
              )}
              <div style={{ opacity: 0.7, marginTop: 2 }}>
                validation: {lastOperation.validationStatus ?? "—"}
                {lastOperation.runtimeErrors != null && <> · runtime errors: {lastOperation.runtimeErrors}</>}
              </div>
              {lastOperation.rollbackId && (
                <div style={{ opacity: 0.6, marginTop: 2 }}>rollback → {lastOperation.rollbackId.slice(0, 8)}</div>
              )}
              <div style={{ opacity: 0.4, marginTop: 2, fontFamily: "monospace", fontSize: 10 }}>{lastOperation.operationId}</div>
            </div>
          ) : <div style={{ opacity: 0.5 }}>No operation yet.</div>}
        </section>
        <section>
          <div style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>Applied preferences</div>
          {profile && profile.applied.length ? (
            <ul style={{ margin: 0, paddingLeft: 14 }}>
              {profile.applied.slice(0, 6).map((p) => (
                <li key={p.id}>{p.key} → {p.value} <span style={{ opacity: 0.5 }}>({(p.confidence * 100).toFixed(0)}%)</span></li>
              ))}
            </ul>
          ) : <div style={{ opacity: 0.5 }}>Nothing learned yet. Confirm changes to teach Obsidian.</div>}
        </section>
        <section>
          <div style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>Build quality</div>
          {learning.length ? (
            <div>
              <div>{learning.length} graded build{learning.length === 1 ? "" : "s"} · avg {avgScore}/100</div>
              {best.length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 14 }}>
                  {best.map((e) => (
                    <li key={e.id}>
                      {e.family} · {e.profile} <span style={{ opacity: 0.5 }}>({scoreOf(e)}/100)</span>
                    </li>
                  ))}
                </ul>
              )}
              {bias.weakModels.length > 0 && (
                <div style={{ opacity: 0.7, marginTop: 4 }}>avoiding: {bias.weakModels.slice(0, 3).join(", ")}</div>
              )}
            </div>
          ) : <div style={{ opacity: 0.5 }}>No graded builds yet. Every build you make teaches Obsidian.</div>}
        </section>
      </div>
    </div>
  );
}
