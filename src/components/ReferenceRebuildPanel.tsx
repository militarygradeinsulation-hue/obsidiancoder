import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Globe2,
  ImagePlus,
  Images,
  Loader2,
  ScanLine,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  analyzeBuildReference,
  type ReferenceScanResult,
} from "@/lib/reference-rebuild.functions";

export type ReferenceMode = "url" | "images";

export interface ReferenceRebuildReady {
  prompt: string;
  summary: string;
  sourceKind: "url" | "images";
  mode: "exact" | "inspired";
  confidence: number;
  warnings: string[];
}

interface ReferenceRebuildPanelProps {
  open: boolean;
  disabled?: boolean;
  initialMode?: ReferenceMode;
  onClose: () => void;
  onReady: (result: ReferenceRebuildReady) => void | Promise<void>;
}

type ReferenceImage = {
  id: string;
  name: string;
  dataUrl: string;
};

const MAX_FILES = 6;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1800;

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

async function optimizeReferenceImage(file: File): Promise<string> {
  const image = await readImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare that image.");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.9);
}

export function ReferenceRebuildPanel({
  open,
  disabled = false,
  initialMode = "url",
  onClose,
  onReady,
}: ReferenceRebuildPanelProps) {
  const analyze = useServerFn(analyzeBuildReference);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [mode, setMode] = React.useState<ReferenceMode>(initialMode);
  const [url, setUrl] = React.useState("");
  const [images, setImages] = React.useState<ReferenceImage[]>([]);
  const [ownershipConfirmed, setOwnershipConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setMode(initialMode);
    if (!open) {
      setError(null);
      setBusy(false);
    }
  }, [initialMode, open]);

  const chooseFiles = React.useCallback(async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    setError(null);

    const available = MAX_FILES - images.length;
    if (available <= 0) {
      setError(`Use up to ${MAX_FILES} reference images at a time.`);
      return;
    }

    const accepted = incoming.slice(0, available);
    const invalid = accepted.find((file) => !/^image\/(png|jpeg|webp)$/i.test(file.type));
    if (invalid) {
      setError("Use PNG, JPG, or WebP images.");
      return;
    }
    const oversized = accepted.find((file) => file.size > MAX_SOURCE_BYTES);
    if (oversized) {
      setError("Keep each source image under 8 MB.");
      return;
    }

    try {
      const prepared: ReferenceImage[] = [];
      for (const file of accepted) {
        prepared.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          dataUrl: await optimizeReferenceImage(file),
        });
      }
      setImages((current) => [...current, ...prepared].slice(0, MAX_FILES));
      if (incoming.length > available) {
        setError(`Only the first ${available} image${available === 1 ? "" : "s"} were added. Maximum: ${MAX_FILES}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare those images.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [images.length]);

  const removeImage = React.useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    setError(null);
  }, []);

  const run = React.useCallback(async () => {
    if (busy || disabled) return;
    if (mode === "url" && !url.trim()) {
      setError("Paste the public website you want Pocket to scan.");
      return;
    }
    if (mode === "images" && !images.length) {
      setError("Upload at least one reference image.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await analyze({
        data: {
          kind: mode === "url" ? "url" : "image",
          url: mode === "url" ? url.trim() : undefined,
          images: mode === "images"
            ? images.map((image) => ({ dataUrl: image.dataUrl, name: image.name }))
            : undefined,
          ownershipConfirmed,
        },
      }) as ReferenceScanResult;

      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onReady(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference scan failed.");
    } finally {
      setBusy(false);
    }
  }, [analyze, busy, disabled, images, mode, onReady, ownershipConfirmed, url]);

  if (!open) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#F4A125]/25 bg-[#111114]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#F4A125]/30 bg-[#F4A125]/10 text-[#F4A125]">
            <ScanLine size={16} />
          </span>
          <div>
            <p className="text-xs font-semibold text-white">Build from reference</p>
            <p className="text-[10px] text-[#7d8494]">Give Pocket a site or visual examples. It rebuilds the system from what it sees.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close reference rebuild"
          className="rounded-lg p-1.5 text-[#77727E] transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 rounded-xl border border-white/[0.08] bg-black/25 p-1" role="tablist" aria-label="Reference type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "url"}
            onClick={() => {
              setMode("url");
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              mode === "url" ? "bg-[#F4A125]/15 text-[#F4A125]" : "text-[#7d8494] hover:text-white"
            }`}
          >
            <Globe2 size={13} />
            Website
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "images"}
            onClick={() => {
              setMode("images");
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              mode === "images" ? "bg-[#F4A125]/15 text-[#F4A125]" : "text-[#7d8494] hover:text-white"
            }`}
          >
            <Images size={13} />
            Reference images
          </button>
        </div>

        {mode === "url" ? (
          <div className="mt-4">
            <label htmlFor="reference-url" className="text-[11px] font-medium text-[#B7B2BC]">
              Public website
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
              <Globe2 size={14} className="shrink-0 text-[#77727E]" />
              <input
                id="reference-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-[#4D4953]"
              />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => void chooseFiles(event.target.files ?? [])}
            />

            <button
              type="button"
              disabled={busy || images.length >= MAX_FILES}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-between rounded-xl border border-dashed border-white/15 bg-black/25 px-3.5 py-3 text-left transition hover:border-[#F4A125]/45 hover:bg-[#F4A125]/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 disabled:opacity-45"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-[#F4A125]">
                  <Upload size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#E7E2EA]">
                    {images.length ? "Add more reference images" : "Upload reference images"}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[#77727E]">
                    Up to {MAX_FILES}. Use multiple screens, states, mobile views, dashboards, or components from the same system.
                  </p>
                </div>
              </div>
              <span className="ml-3 shrink-0 text-[10px] font-medium text-[#F4A125]">{images.length}/{MAX_FILES}</span>
            </button>

            {images.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((image, index) => (
                  <div key={image.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    <img
                      src={image.dataUrl}
                      alt={`Reference ${index + 1}: ${image.name}`}
                      className="h-28 w-full object-cover object-top"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2 pb-1.5 pt-5">
                      <span className="min-w-0 flex-1 truncate text-[9px] text-white/80">
                        {index + 1}. {image.name}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeImage(image.id)}
                        aria-label={`Remove ${image.name}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/55 text-white/70 opacity-100 transition hover:bg-red-500/20 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <ImagePlus size={14} className="mt-0.5 shrink-0 text-[#F4A125]" />
                  <p className="text-[10px] leading-relaxed text-[#7d8494]">
                    Example: upload a dashboard, settings page, mobile screen, and detail view. Pocket will identify the shared design language and build them as one connected system.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <input
            type="checkbox"
            checked={ownershipConfirmed}
            onChange={(event) => setOwnershipConfirmed(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[#F4A125]"
          />
          <span>
            <span className="block text-[11px] font-medium text-[#B7B2BC]">
              I own these references or have permission to reproduce them.
            </span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-[#6F6A74]">
              Checked = high-fidelity reconstruction. Unchecked = Pocket keeps the layout and design language but replaces protected branding, copy, and imagery.
            </span>
          </span>
        </label>

        <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#F4A125]/15 bg-[#F4A125]/[0.05] px-3 py-2.5">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#F4A125]" />
          <p className="text-[10px] leading-relaxed text-[#8F8993]">
            Pocket can reconstruct normal product, business, dashboard, portfolio, and app references. Sensitive credential, payment, banking, wallet, recovery, and identity-verification flows are blocked.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || disabled || (mode === "url" ? !url.trim() : !images.length)}
          onClick={() => void run()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#F4A125] to-[#DD9324] px-3 py-2.5 text-xs font-semibold text-[#111317] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/70 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : mode === "images" ? <Images size={14} /> : <ScanLine size={14} />}
          {busy
            ? "Analyzing reference…"
            : mode === "images"
              ? `Build from ${images.length} image${images.length === 1 ? "" : "s"}`
              : "Scan & rebuild website"}
        </button>
      </div>
    </div>
  );
}
