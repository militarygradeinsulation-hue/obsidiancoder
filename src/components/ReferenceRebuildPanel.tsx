import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Globe2,
  ImagePlus,
  Loader2,
  ScanLine,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  analyzeBuildReference,
  type ReferenceScanResult,
} from "@/lib/reference-rebuild.functions";

type ReferenceMode = "url" | "image";

export interface ReferenceRebuildReady {
  prompt: string;
  summary: string;
  sourceKind: "url" | "image";
  mode: "exact" | "inspired";
  confidence: number;
  warnings: string[];
}

interface ReferenceRebuildPanelProps {
  open: boolean;
  disabled?: boolean;
  onClose: () => void;
  onReady: (result: ReferenceRebuildReady) => void | Promise<void>;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ReferenceRebuildPanel({
  open,
  disabled = false,
  onClose,
  onReady,
}: ReferenceRebuildPanelProps) {
  const analyze = useServerFn(analyzeBuildReference);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [mode, setMode] = React.useState<ReferenceMode>("url");
  const [url, setUrl] = React.useState("");
  const [imageDataUrl, setImageDataUrl] = React.useState("");
  const [imageName, setImageName] = React.useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const chooseFile = React.useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setError("Use a PNG, JPG, or WebP screenshot.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Keep screenshots under 5 MB.");
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setImageName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that screenshot.");
    }
  }, []);

  const run = React.useCallback(async () => {
    if (busy || disabled) return;
    if (mode === "url" && !url.trim()) {
      setError("Paste the public website you want Pocket to scan.");
      return;
    }
    if (mode === "image" && !imageDataUrl) {
      setError("Upload a screenshot first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await analyze({
        data: {
          kind: mode,
          url: mode === "url" ? url.trim() : undefined,
          imageDataUrl: mode === "image" ? imageDataUrl : undefined,
          imageName: mode === "image" ? imageName : undefined,
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
  }, [analyze, busy, disabled, imageDataUrl, imageName, mode, onReady, ownershipConfirmed, url]);

  if (!open) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-[#DB861F]/35 bg-[#100F14]/95 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-[#DB861F]/35 bg-[#DB861F]/10 text-[#DB861F]">
            <ScanLine size={15} />
          </span>
          <div>
            <p className="text-xs font-semibold text-[#F2EEE8]">Rebuild from reference</p>
            <p className="text-[10px] text-[#77727E]">Scan a public page or screenshot, then rebuild it in Pocket.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close reference rebuild"
          className="rounded-md p-1.5 text-[#77727E] transition hover:bg-white/5 hover:text-[#F2EEE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DB861F]/60"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-black/25 p-1" role="tablist" aria-label="Reference type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "url"}
            onClick={() => {
              setMode("url");
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition ${
              mode === "url" ? "bg-[#DB861F]/15 text-[#DB861F]" : "text-[#77727E] hover:text-[#F2EEE8]"
            }`}
          >
            <Globe2 size={13} />
            Website URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "image"}
            onClick={() => {
              setMode("image");
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition ${
              mode === "image" ? "bg-[#DB861F]/15 text-[#DB861F]" : "text-[#77727E] hover:text-[#F2EEE8]"
            }`}
          >
            <ImagePlus size={13} />
            Screenshot
          </button>
        </div>

        {mode === "url" ? (
          <div className="mt-3">
            <label htmlFor="reference-url" className="text-[11px] font-medium text-[#B7B2BC]">
              Public website
            </label>
            <div className="mt-1 flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5">
                <Globe2 size={13} className="shrink-0 text-[#77727E]" />
                <input
                  id="reference-url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  disabled={busy}
                  className="min-w-0 flex-1 bg-transparent py-2 text-xs text-[#F2EEE8] outline-none placeholder:text-[#4D4953]"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-white/15 bg-black/25 px-3 py-3 text-left transition hover:border-[#DB861F]/45 hover:bg-[#DB861F]/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DB861F]/60"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.04] text-[#DB861F]">
                  <Upload size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#E7E2EA]">
                    {imageName || "Upload a reference screenshot"}
                  </p>
                  <p className="text-[10px] text-[#77727E]">PNG, JPG or WebP · max 5 MB</p>
                </div>
              </div>
              {imageDataUrl ? <span className="text-[10px] font-medium text-[#DB861F]">Ready</span> : null}
            </button>
            {imageDataUrl ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                <img
                  src={imageDataUrl}
                  alt="Uploaded website reference"
                  className="max-h-36 w-full object-cover object-top"
                />
              </div>
            ) : null}
          </div>
        )}

        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2">
          <input
            type="checkbox"
            checked={ownershipConfirmed}
            onChange={(event) => setOwnershipConfirmed(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[#DB861F]"
          />
          <span>
            <span className="block text-[11px] font-medium text-[#B7B2BC]">
              I own this page or have permission to reproduce it.
            </span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-[#6F6A74]">
              Checked = high-fidelity rebuild, including visible copy and assets when available. Unchecked = Pocket preserves the structure and visual language but replaces protected branding, copy and imagery.
            </span>
          </span>
        </label>

        <div className="mt-2 flex items-start gap-2 rounded-lg border border-[#C77A1E]/20 bg-[#C77A1E]/[0.06] px-2.5 py-2">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#C77A1E]" />
          <p className="text-[10px] leading-relaxed text-[#8F8993]">
            Sensitive sign-in, password, 2FA, payment, banking, wallet, account-recovery and identity-verification pages are blocked from cloning.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-2 rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || disabled || (mode === "url" ? !url.trim() : !imageDataUrl)}
          onClick={() => void run()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#DB861F] px-3 py-2 text-xs font-semibold text-[#100F14] transition hover:bg-[#E7932C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DB861F]/70 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
          {busy ? "Scanning reference…" : "Scan & rebuild"}
        </button>
      </div>
    </div>
  );
}
