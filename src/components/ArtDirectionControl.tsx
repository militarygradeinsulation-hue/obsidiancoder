/**
 * Art Direction control for the Vibe Coder.
 *
 * Exposes the exact same creative engine Obsidian Pocket uses: a build
 * profile (Fast / Studio / Cinematic) and a style family (luxury, cinematic,
 * editorial, brutalist, organic, futuristic, …) plus a read-out of the
 * resolved model and the current build's Design DNA.
 */
import * as React from "react";
import {
  POCKET_PROFILES,
  POCKET_STYLE_FAMILIES,
  getFamily,
  dnaSummaryLine,
  type PocketDesignDNA,
  type PocketProfile,
  type PocketStyleFamily,
} from "@/lib/pocket-creative";

export type ArtDirectionControlProps = {
  profile: PocketProfile;
  family: PocketStyleFamily;
  dna: PocketDesignDNA | null;
  /** Human label for the model that will actually run the build. */
  modelLabel: string;
  /** Estimated provider calls for this profile. */
  callEstimate: number;
  paidAccess: boolean;
  disabled?: boolean;
  onProfileChange: (p: PocketProfile) => void;
  onFamilyChange: (f: PocketStyleFamily) => void;
  onLocked: (what: string) => void;
};

export function ArtDirectionControl({
  profile,
  family,
  dna,
  modelLabel,
  callEstimate,
  paidAccess,
  disabled,
  onProfileChange,
  onFamilyChange,
  onLocked,
}: ArtDirectionControlProps) {
  return (
    <div className="obs-art-direction" data-testid="art-direction">
      <div className="obs-art-row">
        <span className="obs-art-label">Art direction</span>
        <div className="obs-mode-group" role="group" aria-label="Build profile">
          {POCKET_PROFILES.map((pf) => {
            const active = profile === pf.id;
            const locked = pf.paidOnly && !paidAccess;
            return (
              <button
                key={pf.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={`${pf.blurb}${locked ? " Requires an upgraded plan." : ""}`}
                className={"obs-mode " + (active ? "is-on " : "") + (locked ? "is-locked" : "")}
                onClick={() => {
                  if (locked) {
                    onLocked(`${pf.label} builds`);
                    return;
                  }
                  onProfileChange(pf.id);
                }}
              >
                {pf.label}
                {locked ? " · $" : ""}
              </button>
            );
          })}
        </div>
        <label className="sr-only" htmlFor="vibe-style-family">
          Style family
        </label>
        <select
          id="vibe-style-family"
          className="obs-model"
          value={family}
          disabled={disabled}
          onChange={(e) => onFamilyChange(e.target.value as PocketStyleFamily)}
        >
          {POCKET_STYLE_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f === "auto" ? "Auto style" : getFamily(f).label}
            </option>
          ))}
        </select>
        <span className="obs-art-meta" title="Model availability depends on the configured AI gateway.">
          {modelLabel} · {callEstimate} call{callEstimate === 1 ? "" : "s"}
        </span>
      </div>
      {dna && (
        <p className="obs-art-dna" title={dnaSummaryLine(dna)}>
          Design DNA · {dnaSummaryLine(dna)}
        </p>
      )}
    </div>
  );
}

export default ArtDirectionControl;
