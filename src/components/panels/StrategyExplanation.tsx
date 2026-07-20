// Strategy explanation drawer — plain-English summary of why the router
// chose what it chose. No hidden chain-of-thought, just cited signals.
// Also shows the last operation's provider fallback and outcome so the
// user can see what actually happened after generation completes.

import * as React from "react";
import type { RoutingDecision } from "@/lib/adaptive-router";
import type { OperationSummary } from "@/lib/operation-tracker";

interface Props {
  decision?: RoutingDecision;
  lastOperation?: OperationSummary;
}

export function StrategyExplanation({ decision, lastOperation }: Props) {
  if (!decision && !lastOperation) return null;
  return (
    <details className="obs-card" data-testid="strategy-explanation">
      <summary className="obs-card-head" style={{ cursor: "pointer" }}>
        Why this strategy?
      </summary>
      <div className="obs-card-body" style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {decision && (
          <>
            <div><b>Chosen:</b> {decision.chosenStrategy} · {decision.chosenModel}</div>
            <div>{decision.why}</div>
            {decision.signalsUsed.length > 0 && (
              <div>
                <div style={{ opacity: 0.6, fontSize: 10, textTransform: "uppercase" }}>Signals applied</div>
                <ul style={{ margin: "2px 0 0 14px" }}>
                  {decision.signalsUsed.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
            {decision.signalsIgnored.length > 0 && (
              <div>
                <div style={{ opacity: 0.6, fontSize: 10, textTransform: "uppercase" }}>Signals ignored (low confidence)</div>
                <ul style={{ margin: "2px 0 0 14px" }}>
                  {decision.signalsIgnored.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
            {decision.alternatives.length > 0 && (
              <div>
                <div style={{ opacity: 0.6, fontSize: 10, textTransform: "uppercase" }}>Alternatives considered</div>
                <ul style={{ margin: "2px 0 0 14px" }}>
                  {decision.alternatives.map((a) => (
                    <li key={`${a.strategy}-${a.model}`}>{a.strategy} · {a.model} ({(a.successRate * 100).toFixed(0)}%)</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {lastOperation && (
          <div data-testid="strategy-last-op" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 6 }}>
            <div style={{ opacity: 0.6, fontSize: 10, textTransform: "uppercase" }}>Last run</div>
            <div>outcome: <b>{lastOperation.outcome}</b> · validation: {lastOperation.validationStatus ?? "—"}</div>
            {lastOperation.providerChain.length > 0 && (
              <div>fallback chain: {lastOperation.providerChain.join(" → ")}</div>
            )}
            {(lastOperation.imageCount ?? 0) > 0 && (
              <div>images: {lastOperation.imageCount} ({lastOperation.imageProviders})</div>
            )}
            {lastOperation.rollbackId && (
              <div style={{ opacity: 0.7 }}>rollback point: {lastOperation.rollbackId.slice(0, 8)}</div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
