import * as React from "react";
import { ImagePlus, Images, Trash2, Upload, X } from "lucide-react";
import {
  POCKET_ASSET_MAX,
  type PocketProjectAsset,
  type PocketProjectAssetDraft,
} from "@/lib/pocket-project-assets";

type Props = {
  open: boolean;
  disabled?: boolean;
  assets: PocketProjectAsset[];
  hasBuild: boolean;
  onClose: () => void;
  onAdd: (asset: PocketProjectAssetDraft) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onUseNow: (asset: PocketProjectAsset) => void | Promise<void>;
};

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 600_000;

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

async function prepareProjectImage(file: File): Promise<string> {
  const image = await readImage(file);
  let maxDimension = 1400;
  let quality = 0.82;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare that image.");
    ctx.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
    maxDimension = Math.max(720, Math.round(maxDimension * 0.82));
    quality = Math.max(0.58, quality - 0.06);
  }

  throw new Error("That image is still too large after optimization. Try a smaller source image.");
}

export function PocketProjectAssetsPanel({
  open,
  disabled = false,
  assets,
  hasBuild,
  onClose,
  onAdd,
  onRemove,
  onUseNow,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  const choose = React.useCallback(async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (!incoming.length || working) return;
    const available = POCKET_ASSET_MAX - assets.length;
    if (available <= 0) {
      setError(`Use up to ${POCKET_ASSET_MAX} project images at a time.`);
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
      setError("Keep each source image under 10 MB.");
      return;
    }

    setWorking(true);
    setError(null);
    try {
      for (const file of accepted) {
        const asset: PocketProjectAssetDraft = {
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name.slice(0, 120),
          dataUrl: await prepareProjectImage(file),
          createdAt: Date.now(),
        };
        await onAdd(asset);
      }
      if (incoming.length > available) {
        setError(`Added the first ${available}. Maximum: ${POCKET_ASSET_MAX}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add those images.");
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [assets.length, onAdd, working]);

  if (!open) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#F4A125]/25 bg-[#111114]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#F4A125]/30 bg-[#F4A125]/10 text-[#F4A125]">
            <Images size={16} />
          </span>
          <div>
            <p className="text-xs font-semibold text-white">Project images</p>
            <p className="text-[10px] text-[#7d8494]">Images attached to this Pocket project for generation and targeted refinements.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close project images" className="rounded-lg p-1.5 text-[#77727E] hover:bg-white/5 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="p-4">
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => void choose(event.target.files ?? [])}
        />
        <button
          type="button"
          disabled={disabled || working || assets.length >= POCKET_ASSET_MAX}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-white/15 bg-black/25 px-3.5 py-3 text-left transition hover:border-[#F4A125]/45 hover:bg-[#F4A125]/[0.05] disabled:opacity-45"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] text-[#F4A125]"><Upload size={16} /></span>
            <div>
              <p className="text-xs font-medium text-[#E7E2EA]">{working ? "Preparing images…" : assets.length ? "Add more project images" : "Upload project images"}</p>
              <p className="mt-0.5 text-[10px] text-[#77727E]">Upload before Build to make them active project media. After Build, use Add to build to place an exact image.</p>
            </div>
          </div>
          <span className="text-[10px] font-medium text-[#F4A125]">{assets.length}/{POCKET_ASSET_MAX}</span>
        </button>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2">
            <p className="text-[10px] font-semibold text-[#E7E2EA]">Before a build</p>
            <p className="mt-1 text-[9px] leading-relaxed text-[#77727E]">Uploaded images are sent as lightweight project-media references. Pocket can use the real hosted image without sending the image bytes through the LLM prompt.</p>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2">
            <p className="text-[10px] font-semibold text-[#E7E2EA]">After a build</p>
            <p className="mt-1 text-[9px] leading-relaxed text-[#77727E]">Select Add to build. Pocket runs a focused Refine request that places the image while preserving the current design, section order, typography, and palette.</p>
          </div>
        </div>

        {assets.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {assets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <img src={asset.url} alt={asset.name} className="h-24 w-full object-cover object-center" />
                <div className="p-2">
                  <p className="truncate text-[10px] text-white/75">{asset.name}</p>
                  <p className="mt-0.5 text-[9px] text-[#67636d]">{asset.localOnly ? "Local fallback" : "Hosted asset"}</p>
                  <div className="mt-2 flex gap-1">
                    {hasBuild ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void onUseNow(asset)}
                        className="flex-1 rounded-md border border-[#F4A125]/30 bg-[#F4A125]/10 px-2 py-1 text-[9px] font-semibold text-[#F4A125] hover:bg-[#F4A125]/15"
                      >
                        Add to build
                      </button>
                    ) : (
                      <span className="flex-1 px-1 py-1 text-[9px] text-[#77727E]">Ready for next build</span>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void onRemove(asset.id)}
                      aria-label={`Remove ${asset.name}`}
                      className="grid h-6 w-6 place-items-center rounded-md text-white/45 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <ImagePlus size={14} className="mt-0.5 shrink-0 text-[#F4A125]" />
            <p className="text-[10px] leading-relaxed text-[#7d8494]">
              Upload logos, product photos, screenshots, team photos, diagrams, or client imagery. Pocket can place them in the next build or refine them into the current build.
            </p>
          </div>
        )}

        {error ? <p className="mt-2 text-[10px] text-amber-300">{error}</p> : null}
      </div>
    </div>
  );
}
