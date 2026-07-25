// Design Library Panel — templates, styles, components, customize, approved,
// inspire (3 directions). Self-contained: writes DesignContract per session
// into localStorage under `obs.designContract.v1.<sessionId>`, which
// index.tsx reads when sending to /api/generate.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Search, Sparkles, Layers, Palette, Layout, Component, Star, RotateCcw, Check, Loader2, ExternalLink } from "lucide-react";
import {
  COMPONENTS, STYLES, TEMPLATES, FONT_PAIRINGS,
  applyStyleToContract, applyTemplateToContract, clearContract, defaultContract,
  fontById, guessTemplateId, inspireDirections, loadApproved, loadContract, recommendComponentIds,
  saveContract, styleById, templateById, toggleApproved, type DesignContract,
  type DesignStylePreset, type TemplatePreset, type ComponentReference,
} from "@/lib/design-library";
import { designLibraryStatusFn, searchComponentsFn, searchTemplatesFn, type UiComponentHit, type UiTemplateHit } from "@/lib/design-library.functions";

type Tab = "templates" | "styles" | "components" | "customize" | "approved" | "inspire";

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentPrompt?: string;
  onContractChange?: (c: DesignContract | undefined) => void;
};

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

export function DesignLibraryPanel({ open, onClose, sessionId, currentPrompt, onContractChange }: Props) {
  const [tab, setTab] = useState<Tab>("templates");
  const [contract, setContract] = useState<DesignContract>(() => loadContract(sessionId) ?? defaultContract());
  const [remoteConfigured, setRemoteConfigured] = useState<boolean>(false);
  const [approvedTick, setApprovedTick] = useState(0);
  const status = useServerFn(designLibraryStatusFn);
  const searchComponents = useServerFn(searchComponentsFn);
  const searchTemplates = useServerFn(searchTemplatesFn);

  // Reload contract when tab/session changes
  useEffect(() => { setContract(loadContract(sessionId) ?? defaultContract()); }, [sessionId, open]);

  useEffect(() => {
    if (!open) return;
    status().then((s) => setRemoteConfigured(s.configured)).catch(() => setRemoteConfigured(false));
  }, [open, status]);

  const commit = useCallback((next: DesignContract) => {
    setContract(next);
    saveContract(sessionId, next);
    onContractChange?.(next);
  }, [sessionId, onContractChange]);

  const reset = useCallback(() => {
    clearContract(sessionId);
    const d = defaultContract();
    setContract(d);
    onContractChange?.(undefined);
  }, [sessionId, onContractChange]);

  // ---------- remote search state ----------
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [remoteCmp, setRemoteCmp] = useState<UiComponentHit[]>([]);
  const [remoteTpl, setRemoteTpl] = useState<UiTemplateHit[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [source, setSource] = useState<"all" | "obsidian" | "21st">("all");

  useEffect(() => {
    if (!open || !remoteConfigured) return;
    if (!(tab === "components" || tab === "templates")) return;
    const trimmed = dq.trim();
    if (trimmed.length < 3) { setRemoteCmp([]); setRemoteTpl([]); return; }
    let cancelled = false;
    setRemoteLoading(true); setRemoteError(null);
    (async () => {
      try {
        if (tab === "components") {
          const r = await searchComponents({ data: { query: trimmed, limit: 12 } });
          if (!cancelled) setRemoteCmp(r.hits);
        } else {
          const r = await searchTemplates({ data: { query: trimmed, limit: 12 } });
          if (!cancelled) setRemoteTpl(r.hits);
        }
      } catch {
        if (!cancelled) setRemoteError("Remote search unavailable.");
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dq, open, remoteConfigured, tab, searchComponents, searchTemplates]);

  const approved = useMemo(() => loadApproved(), [approvedTick, open]);

  if (!open) return null;

  const style = styleById(contract.styleId);
  const template = templateById(contract.templateId);

  return (
    <div className="dl-modal-backdrop" onClick={onClose}>
      <div className="dl-modal" role="dialog" aria-label="Design Library" onClick={(e) => e.stopPropagation()}>
        <header className="dl-head">
          <div className="dl-title"><Layers size={16} /> Design Library</div>
          <div className="dl-head-right">
            <span className="dl-badge" title={remoteConfigured ? "21st.dev connected" : "21st.dev not configured — local catalog only"}>
              <span className={`dl-dot ${remoteConfigured ? "on" : "off"}`} /> 21st.dev {remoteConfigured ? "on" : "local only"}
            </span>
            <button type="button" className="dl-ghost" onClick={reset} title="Reset design contract">
              <RotateCcw size={13} /> Reset
            </button>
            <button type="button" className="dl-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </header>

        <nav className="dl-tabs" role="tablist">
          {(["templates","styles","components","customize","inspire","approved"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab===t} className={`dl-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>
              {t === "templates" && <><Layout size={13} /> Templates</>}
              {t === "styles" && <><Palette size={13} /> Styles</>}
              {t === "components" && <><Component size={13} /> Components</>}
              {t === "customize" && <><Sparkles size={13} /> Customize</>}
              {t === "inspire" && <><Sparkles size={13} /> Inspire</>}
              {t === "approved" && <><Star size={13} /> Approved</>}
            </button>
          ))}
        </nav>

        {(tab === "templates" || tab === "components") && (
          <div className="dl-search-row">
            <div className="dl-search">
              <Search size={13} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "components" ? "Search components (e.g. pricing, hero)…" : "Search templates (e.g. saas, dashboard)…"} />
            </div>
            <select className="dl-select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="all">All sources</option>
              <option value="obsidian">Obsidian curated</option>
              <option value="21st">21st.dev</option>
            </select>
          </div>
        )}

        <div className="dl-body">
          {/* Selected direction summary */}
          <div className="dl-selected">
            <div className="dl-selected-swatches">
              {[contract.palette.bg, contract.palette.surface, contract.palette.primary, contract.palette.accent, contract.palette.text].map((c, i) => (
                <span key={i} className="dl-swatch" style={{ background: c }} title={c} />
              ))}
            </div>
            <div className="dl-selected-meta">
              <b>{style?.name ?? "Custom"}</b>
              {template && <span className="dl-chip">{template.name}</span>}
              <span className="dl-chip">{contract.layout}</span>
              <span className="dl-chip">{contract.density}</span>
              <span className="dl-chip">radius: {contract.radius}</span>
              <span className="dl-chip">shadow: {contract.shadow}</span>
              <span className="dl-chip">motion: {contract.motionId}</span>
              {contract.componentIds.length > 0 && <span className="dl-chip">{contract.componentIds.length} components</span>}
            </div>
          </div>

          {tab === "templates" && (
            <div className="dl-grid">
              {(source !== "21st") && TEMPLATES.filter((t) => !q || (t.name + " " + t.tags.join(" ")).toLowerCase().includes(q.toLowerCase())).map((t) => (
                <TemplateCard key={t.id} tpl={t} selected={contract.templateId === t.id} onApply={() => commit(applyTemplateToContract(contract, t.id))} onApprove={() => { toggleApproved({ id: t.id, kind: "template", label: t.name, source: "obsidian", addedAt: Date.now() }); setApprovedTick(x => x+1); }} />
              ))}
              {(source !== "obsidian") && remoteConfigured && remoteTpl.map((h) => (
                <RemoteCard key={h.id} name={h.name} description={h.description} previewUrl={h.previewUrl} tags={h.tags} kind="template"
                  onApprove={() => { toggleApproved({ id: h.id, kind: "template", label: h.name, source: "21st.dev", identifier: h.identifier, addedAt: Date.now() }); setApprovedTick(x => x+1); }}
                  onUse={() => commit({ ...contract, designNote: `${contract.designNote ?? ""} Use structure inspired by ${h.name} (21st.dev). Adapt into an original design.`.trim(), updatedAt: Date.now() })} />
              ))}
              {remoteLoading && <div className="dl-status"><Loader2 className="dl-spin" size={14} /> Searching 21st.dev…</div>}
              {remoteError && <div className="dl-status err">{remoteError}</div>}
            </div>
          )}

          {tab === "styles" && (
            <div className="dl-grid">
              {STYLES.map((s) => (
                <StyleCard key={s.id} style={s} selected={contract.styleId === s.id}
                  onApply={() => commit(applyStyleToContract(contract, s.id))}
                  onApprove={() => { toggleApproved({ id: s.id, kind: "style", label: s.name, source: "obsidian", addedAt: Date.now() }); setApprovedTick(x => x+1); }} />
              ))}
            </div>
          )}

          {tab === "components" && (
            <div className="dl-grid">
              {(source !== "21st") && recommendedFirst(COMPONENTS, currentPrompt ?? "").filter((c) => !q || (c.name + " " + c.tags.join(" ") + " " + c.kind).toLowerCase().includes(q.toLowerCase())).map((c) => (
                <ComponentCard key={c.id} cmp={c} selected={contract.componentIds.includes(c.id)}
                  onToggle={() => {
                    const has = contract.componentIds.includes(c.id);
                    commit({ ...contract, componentIds: has ? contract.componentIds.filter((x) => x !== c.id) : [...contract.componentIds, c.id], updatedAt: Date.now() });
                  }}
                  onApprove={() => { toggleApproved({ id: c.id, kind: "component", label: c.name, source: "obsidian", addedAt: Date.now() }); setApprovedTick(x => x+1); }} />
              ))}
              {(source !== "obsidian") && remoteConfigured && remoteCmp.map((h) => (
                <RemoteCard key={h.id} name={h.name} description={h.description} previewUrl={h.previewUrl} tags={h.tags} kind="component"
                  onApprove={() => { toggleApproved({ id: h.id, kind: "component", label: h.name, source: "21st.dev", identifier: h.identifier, addedAt: Date.now() }); setApprovedTick(x => x+1); }}
                  onUse={() => commit({ ...contract, designNote: `${contract.designNote ?? ""} Include a section like ${h.name} (structure only, adapted). `.trim(), updatedAt: Date.now() })} />
              ))}
              {remoteLoading && <div className="dl-status"><Loader2 className="dl-spin" size={14} /> Searching 21st.dev…</div>}
              {!remoteConfigured && q.length >= 3 && <div className="dl-status">Remote search disabled — showing Obsidian curated components. Set <code>API_KEY_21ST</code> to enable 21st.dev results.</div>}
            </div>
          )}

          {tab === "customize" && (
            <Customize contract={contract} commit={commit} />
          )}

          {tab === "inspire" && (
            <InspireTab prompt={currentPrompt ?? ""} onPick={(d) => {
              const next = applyStyleToContract(applyTemplateToContract(contract, d.templateId ?? guess(currentPrompt ?? "")), d.styleId);
              commit({ ...next, componentIds: recommendComponentIds(currentPrompt ?? ""), updatedAt: Date.now() });
              setTab("customize");
            }} />
          )}

          {tab === "approved" && (
            <div className="dl-grid">
              {approved.length === 0 && <div className="dl-status">No approved items yet. Star a template, style or component to save it here (local to this browser).</div>}
              {approved.map((a) => (
                <div key={`${a.kind}:${a.id}`} className="dl-card">
                  <div className="dl-card-title">{a.label}</div>
                  <div className="dl-card-meta"><span className="dl-chip">{a.kind}</span><span className="dl-chip">{a.source}</span></div>
                  <div className="dl-card-actions">
                    <button type="button" className="dl-btn ghost" onClick={() => { toggleApproved(a); setApprovedTick(x => x+1); }}>Remove</button>
                    {a.kind === "style" && a.source === "obsidian" && (
                      <button type="button" className="dl-btn primary" onClick={() => commit(applyStyleToContract(contract, a.id))}>Apply</button>
                    )}
                    {a.kind === "template" && a.source === "obsidian" && (
                      <button type="button" className="dl-btn primary" onClick={() => commit(applyTemplateToContract(contract, a.id))}>Apply</button>
                    )}
                    {a.kind === "component" && a.source === "obsidian" && (
                      <button type="button" className="dl-btn primary" onClick={() => {
                        const has = contract.componentIds.includes(a.id);
                        commit({ ...contract, componentIds: has ? contract.componentIds : [...contract.componentIds, a.id], updatedAt: Date.now() });
                      }}>Add</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="dl-foot">
          <span>Designs are adapted into <b>original</b> builds. Respect third-party component licenses shown as attribution.</span>
          <div className="dl-foot-actions">
            <span className="dl-selected-meta"><b>Font:</b> {fontById(contract.fontPairingId)?.name}</span>
            <button type="button" className="dl-btn primary" onClick={onClose}><Check size={13} /> Done</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function guess(prompt: string): string {
  return guessTemplateId(prompt);
}

function recommendedFirst(list: ComponentReference[], prompt: string): ComponentReference[] {
  if (!prompt) return list;
  const ids = new Set(recommendComponentIds(prompt, 8));
  const hits = list.filter((c) => ids.has(c.id));
  const rest = list.filter((c) => !ids.has(c.id));
  return [...hits, ...rest];
}

// ---------- Cards ---------------------------------------------------------

function TemplateCard({ tpl, selected, onApply, onApprove }: { tpl: TemplatePreset; selected: boolean; onApply: () => void; onApprove: () => void; }) {
  return (
    <div className={`dl-card ${selected ? "sel" : ""}`}>
      <div className="dl-card-title">{tpl.name}</div>
      <div className="dl-card-desc">{tpl.description}</div>
      <div className="dl-card-meta">{tpl.tags.slice(0,4).map((t) => <span key={t} className="dl-chip">{t}</span>)}</div>
      <div className="dl-card-sections">{tpl.sections.slice(0, 6).join(" · ")}</div>
      <div className="dl-card-actions">
        <button type="button" className="dl-btn ghost" onClick={onApprove} title="Save to Approved"><Star size={12} /></button>
        <button type="button" className={`dl-btn ${selected ? "sel" : "primary"}`} onClick={onApply}>{selected ? "Selected" : "Use structure"}</button>
      </div>
    </div>
  );
}

function StyleCard({ style, selected, onApply, onApprove }: { style: DesignStylePreset; selected: boolean; onApply: () => void; onApprove: () => void; }) {
  return (
    <div className={`dl-card ${selected ? "sel" : ""}`}>
      <div className="dl-card-preview" style={{
        background: `linear-gradient(135deg, ${style.palette.bg}, ${style.palette.surface})`,
        color: style.palette.text,
        borderColor: style.palette.border ?? "transparent",
      }}>
        <div className="dl-card-preview-title" style={{ fontFamily: fontById(style.fontPairingId)?.display }}>Aa</div>
        <div className="dl-card-preview-swatches">
          <span style={{ background: style.palette.primary }} />
          <span style={{ background: style.palette.accent }} />
          <span style={{ background: style.palette.ring }} />
        </div>
      </div>
      <div className="dl-card-title">{style.name}</div>
      <div className="dl-card-desc">{style.description}</div>
      <div className="dl-card-meta">{style.mood.map((m) => <span key={m} className="dl-chip">{m}</span>)}</div>
      <div className="dl-card-actions">
        <button type="button" className="dl-btn ghost" onClick={onApprove} title="Save to Approved"><Star size={12} /></button>
        <button type="button" className={`dl-btn ${selected ? "sel" : "primary"}`} onClick={onApply}>{selected ? "Selected" : "Apply style"}</button>
      </div>
    </div>
  );
}

function ComponentCard({ cmp, selected, onToggle, onApprove }: { cmp: ComponentReference; selected: boolean; onToggle: () => void; onApprove: () => void; }) {
  return (
    <div className={`dl-card ${selected ? "sel" : ""}`}>
      <div className="dl-card-title">{cmp.name}</div>
      <div className="dl-card-desc">{cmp.description}</div>
      <div className="dl-card-meta"><span className="dl-chip">{cmp.kind}</span>{cmp.tags.slice(0,3).map((t) => <span key={t} className="dl-chip">{t}</span>)}</div>
      <div className="dl-card-actions">
        <button type="button" className="dl-btn ghost" onClick={onApprove} title="Save to Approved"><Star size={12} /></button>
        <button type="button" className={`dl-btn ${selected ? "sel" : "primary"}`} onClick={onToggle}>{selected ? "Remove" : "Add to build"}</button>
      </div>
    </div>
  );
}

function RemoteCard({ name, description, previewUrl, tags, kind, onUse, onApprove }: { name: string; description?: string; previewUrl?: string; tags: string[]; kind: "component" | "template"; onUse: () => void; onApprove: () => void; }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="dl-card">
      {previewUrl && imgOk && (
        <div className="dl-card-preview">
          <img src={previewUrl} alt="" loading="lazy" onError={() => setImgOk(false)} />
        </div>
      )}
      <div className="dl-card-title">{name} <span className="dl-source">· 21st.dev</span></div>
      {description && <div className="dl-card-desc">{description}</div>}
      <div className="dl-card-meta"><span className="dl-chip">{kind}</span>{tags.slice(0,3).map((t) => <span key={t} className="dl-chip">{t}</span>)}</div>
      <div className="dl-card-actions">
        <button type="button" className="dl-btn ghost" onClick={onApprove} title="Save to Approved"><Star size={12} /></button>
        {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="dl-btn ghost" title="Open source"><ExternalLink size={12} /></a>}
        <button type="button" className="dl-btn primary" onClick={onUse}>Use as direction</button>
      </div>
    </div>
  );
}

// ---------- Customize -----------------------------------------------------

function Customize({ contract, commit }: { contract: DesignContract; commit: (c: DesignContract) => void; }) {
  const set = <K extends keyof DesignContract>(k: K, v: DesignContract[K]) => commit({ ...contract, [k]: v, updatedAt: Date.now() });
  const setPal = (k: keyof DesignContract["palette"], v: string) => commit({ ...contract, palette: { ...contract.palette, [k]: v }, updatedAt: Date.now() });
  return (
    <div className="dl-form">
      <div className="dl-form-row">
        <label>Appearance
          <select value={contract.appearance} onChange={(e) => set("appearance", e.target.value as DesignContract["appearance"])}>
            <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
        <label>Font pairing
          <select value={contract.fontPairingId} onChange={(e) => set("fontPairingId", e.target.value)}>
            {FONT_PAIRINGS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label>Density
          <select value={contract.density} onChange={(e) => set("density", e.target.value as DesignContract["density"])}>
            <option value="compact">Compact</option><option value="balanced">Balanced</option><option value="airy">Airy</option>
          </select>
        </label>
      </div>
      <div className="dl-form-row">
        <label>Radius
          <select value={contract.radius} onChange={(e) => set("radius", e.target.value as DesignContract["radius"])}>
            <option value="sharp">Sharp</option><option value="subtle">Subtle</option><option value="rounded">Rounded</option><option value="pill">Pill</option>
          </select>
        </label>
        <label>Shadows
          <select value={contract.shadow} onChange={(e) => set("shadow", e.target.value as DesignContract["shadow"])}>
            <option value="none">None</option><option value="subtle">Subtle</option><option value="elevated">Elevated</option><option value="dramatic">Dramatic</option>
          </select>
        </label>
        <label>Layout
          <select value={contract.layout} onChange={(e) => set("layout", e.target.value as DesignContract["layout"])}>
            <option value="centered">Centered</option><option value="split">Split</option><option value="asymmetric">Asymmetric</option><option value="editorial">Editorial</option><option value="dashboard">Dashboard</option>
          </select>
        </label>
        <label>Motion
          <select value={contract.motionId} onChange={(e) => set("motionId", e.target.value as DesignContract["motionId"])}>
            <option value="none">None</option><option value="subtle">Subtle</option><option value="smooth">Smooth</option><option value="expressive">Expressive</option>
          </select>
        </label>
        <label>Imagery
          <select value={contract.imagery} onChange={(e) => set("imagery", e.target.value as DesignContract["imagery"])}>
            <option value="none">None</option><option value="photo">Photo</option><option value="illustration">Illustration</option><option value="3d">3D</option><option value="abstract">Abstract</option><option value="product-ui">Product UI</option>
          </select>
        </label>
      </div>
      <div className="dl-form-row dl-color-row">
        {(["bg","surface","text","muted","primary","accent","ring"] as const).map((k) => (
          <label key={k} className="dl-color">
            <span>{k}</span>
            <input type="color" value={toHex(contract.palette[k])} onChange={(e) => setPal(k, e.target.value)} />
            <input type="text" value={contract.palette[k]} onChange={(e) => setPal(k, e.target.value)} />
          </label>
        ))}
      </div>
      <label className="dl-textarea">
        <span>Design note (optional)</span>
        <textarea rows={3} maxLength={400} value={contract.designNote ?? ""} onChange={(e) => set("designNote", e.target.value)} placeholder="e.g. Warm evening mood, tight display type, one signature interaction on the hero." />
      </label>

      {/* Live preview */}
      <div className="dl-preview" style={{
        background: contract.palette.bg, color: contract.palette.text,
        borderColor: contract.palette.border ?? "rgba(255,255,255,0.08)",
      }}>
        <div style={{ fontFamily: fontById(contract.fontPairingId)?.display }} className="dl-preview-h">The quiet hum of a good design</div>
        <div style={{ fontFamily: fontById(contract.fontPairingId)?.body }} className="dl-preview-b">Deep contrast, one accent, honest hierarchy. Buttons feel alive without shouting.</div>
        <div className="dl-preview-actions">
          <span className="dl-preview-btn" style={{ background: contract.palette.primary, color: contract.palette.bg, borderRadius: radiusPx(contract.radius) }}>Primary</span>
          <span className="dl-preview-btn ghost" style={{ borderColor: contract.palette.accent, color: contract.palette.accent, borderRadius: radiusPx(contract.radius) }}>Secondary</span>
        </div>
      </div>
    </div>
  );
}
function radiusPx(r: DesignContract["radius"]): string {
  return r === "sharp" ? "2px" : r === "subtle" ? "8px" : r === "rounded" ? "14px" : "999px";
}
function toHex(v: string): string {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v.length === 4 ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v;
  return "#111317";
}

// ---------- Inspire -------------------------------------------------------

function InspireTab({ prompt, onPick }: { prompt: string; onPick: (d: ReturnType<typeof inspireDirections>[number]) => void; }) {
  const [seed, setSeed] = useState(0);
  const directions = useMemo(() => inspireDirections(prompt), [prompt, seed]);
  return (
    <div>
      <div className="dl-status">
        Three lightweight directions based on your current prompt. Pick one to seed the design contract (no AI call).
        <button type="button" className="dl-btn ghost" onClick={() => setSeed(seed+1)}>Refresh</button>
      </div>
      <div className="dl-grid">
        {directions.map((d) => (
          <div key={d.id} className="dl-card">
            <div className="dl-card-preview" style={{
              background: `linear-gradient(135deg, ${d.palette.bg}, ${d.palette.surface})`, color: d.palette.text,
            }}>
              <div className="dl-card-preview-title" style={{ fontFamily: fontById(d.fontPairingId)?.display }}>Aa</div>
              <div className="dl-card-preview-swatches">
                <span style={{ background: d.palette.primary }} />
                <span style={{ background: d.palette.accent }} />
                <span style={{ background: d.palette.ring }} />
              </div>
            </div>
            <div className="dl-card-title">{d.name}</div>
            <div className="dl-card-desc">{d.summary}</div>
            <div className="dl-card-meta"><span className="dl-chip">{d.layout}</span><span className="dl-chip">{d.imagery}</span><span className="dl-chip">motion: {d.motionId}</span></div>
            <div className="dl-card-actions">
              <button type="button" className="dl-btn primary" onClick={() => onPick(d)}>Use this direction</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
