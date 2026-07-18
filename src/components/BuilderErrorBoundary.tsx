import * as React from "react";
import { sanitizeErrorMessage } from "@/lib/safe-storage";

type Props = { children: React.ReactNode };
type State = { err: Error | null };

/**
 * App-level shield for the builder shell. Catches render/runtime errors so a
 * single bug can never take down the whole workspace. Does NOT wrap the API
 * transport layer — that's handled by /api/generate returning JSON envelopes.
 */
export class BuilderErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error): void {
    // Keep silent in production; log for local debugging.
    if (typeof console !== "undefined") {
      console.error("[BuilderErrorBoundary]", err);
    }
  }

  reset = () => this.setState({ err: null });

  render() {
    if (!this.state.err) return this.props.children;
    const msg = sanitizeErrorMessage(this.state.err, "The workspace hit an unexpected error.");
    return (
      <div
        role="alert"
        data-testid="builder-error-boundary"
        style={{
          padding: "24px",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050607",
          color: "#f2eee7",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "left" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#c9953d", marginBottom: 8 }}>
            WORKSPACE ERROR
          </div>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Something went wrong in the builder shell.</h1>
          <p style={{ opacity: 0.8, margin: "0 0 20px", lineHeight: 1.5 }}>{msg}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={this.reset}
              style={{
                padding: "10px 16px",
                border: "1px solid #c9953d",
                background: "transparent",
                color: "#f2eee7",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
              style={{
                padding: "10px 16px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#f2eee7",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Reload workspace
            </button>
          </div>
        </div>
      </div>
    );
  }
}
