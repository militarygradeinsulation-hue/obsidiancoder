import { idbGet, idbSet, idbRemove } from "./idb-storage";
import { authFetch } from "./auth-fetch";

export type LocalReferenceAsset = {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  bytes: number;
  createdAt: number;
  hostedId?: string;
  hostedUrl?: string;
  storagePath?: string;
};

const PREFIX = "obs.project-assets.v1.";
const MAX_ASSETS = 12;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_HOST_DATA_URL_CHARS = 600_000;
const MAX_HOST_BYTES = 450_000;

function key(projectId: string) {
  return PREFIX + projectId;
}

function clean(list: unknown): LocalReferenceAsset[] {
  if (!Array.isArray(list)) return [];
  const out: LocalReferenceAsset[] = [];
  let total = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Partial<LocalReferenceAsset>;
    if (
      typeof a.id !== "string" ||
      typeof a.name !== "string" ||
      typeof a.mime !== "string" ||
      typeof a.dataUrl !== "string" ||
      !a.dataUrl.startsWith("data:image/") ||
      typeof a.bytes !== "number" ||
      typeof a.createdAt !== "number"
    ) continue;
    if (a.bytes > 900_000 || total + a.bytes > MAX_TOTAL_BYTES) continue;
    total += a.bytes;
    out.push({
      id: a.id.slice(0, 80),
      name: a.name.slice(0, 180),
      mime: a.mime.slice(0, 100),
      dataUrl: a.dataUrl,
      bytes: a.bytes,
      createdAt: a.createdAt,
      hostedId: typeof a.hostedId === "string" ? a.hostedId.slice(0, 120) : undefined,
      hostedUrl: typeof a.hostedUrl === "string" && /^https:\/\//i.test(a.hostedUrl) ? a.hostedUrl.slice(0, 1200) : undefined,
      storagePath: typeof a.storagePath === "string" ? a.storagePath.slice(0, 500) : undefined,
    });
    if (out.length >= MAX_ASSETS) break;
  }
  return out;
}

export async function loadProjectAssets(projectId: string): Promise<LocalReferenceAsset[]> {
  if (!projectId) return [];
  return clean(await idbGet<LocalReferenceAsset[]>(key(projectId)));
}

export async function saveProjectAssets(projectId: string, assets: LocalReferenceAsset[]): Promise<boolean> {
  if (!projectId) return false;
  return idbSet(key(projectId), clean(assets));
}

export async function clearProjectAssets(projectId: string): Promise<void> {
  if (!projectId) return;
  await idbRemove(key(projectId));
}

export function projectAssetMetadata(
  assets: readonly LocalReferenceAsset[],
): Array<{ id: string; name: string }> {
  return assets
    .filter((asset) => !!asset.hostedId && !!asset.hostedUrl)
    .slice(0, 8)
    .map((asset) => ({ id: asset.hostedId as string, name: asset.name }));
}

export function resolveProjectAssetTokens(
  html: string,
  assets: readonly LocalReferenceAsset[],
): string {
  let out = html;
  for (const asset of assets) {
    if (!asset.hostedId || !asset.hostedUrl) continue;
    const token = "obsidian-asset://" + asset.hostedId;
    if (out.includes(token)) out = out.split(token).join(asset.hostedUrl);
  }
  return out;
}

export async function hostProjectAsset(
  asset: LocalReferenceAsset,
): Promise<LocalReferenceAsset> {
  if (asset.hostedId && asset.hostedUrl) return asset;
  const response = await authFetch("/api/project-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: asset.name, dataUrl: asset.dataUrl }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Could not host project image.");
  }
  const payload = await response.json() as {
    id?: string;
    url?: string;
    path?: string;
  };
  if (!payload.id || !payload.url) throw new Error("Project image host returned an incomplete result.");
  return {
    ...asset,
    hostedId: payload.id,
    hostedUrl: payload.url,
    storagePath: payload.path,
  };
}

export function imageContextBrief(assets: readonly LocalReferenceAsset[]): string {
  if (!assets.length) return "";
  return [
    "LOCAL REFERENCE IMAGES ATTACHED TO THIS PROJECT:",
    ...assets.map((a, i) => `- Reference ${i + 1}: ${a.name} (${a.mime}, ${Math.round(a.bytes / 1024)} KB${a.hostedUrl ? ", hosted" : ", local"})`),
    "Use these as visual/layout/content context. Preserve recognizable composition when the user asks to copy or refine a supplied design.",
  ].join("\n");
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1);
  return Math.ceil((b64.length * 3) / 4);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export async function fileToReferenceAsset(file: File): Promise<LocalReferenceAsset> {
  if (!file.type.startsWith("image/")) throw new Error("Reference asset must be an image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Image is too large (12 MB max before compression).");

  let dataUrl = await readAsDataUrl(file);
  let mime = file.type || "image/png";

  if (!/image\/(svg\+xml|gif)/i.test(mime) && typeof document !== "undefined") {
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = dataUrl;
      await img.decode();
      let maxSide = 1400;
      let quality = 0.74;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) break;
        ctx.drawImage(img, 0, 0, width, height);
        const candidate = canvas.toDataURL("image/webp", quality);
        if (candidate && candidate.length < dataUrl.length) {
          dataUrl = candidate;
          mime = "image/webp";
        }
        if (dataUrl.length <= MAX_HOST_DATA_URL_CHARS && dataUrlBytes(dataUrl) <= MAX_HOST_BYTES) break;
        maxSide = Math.max(760, Math.round(maxSide * 0.82));
        quality = Math.max(0.58, quality - 0.05);
      }
    } catch {
      // Preserve original when browser decode/compression is unavailable.
    }
  }

  const bytes = dataUrlBytes(dataUrl);
  if (dataUrl.length > MAX_HOST_DATA_URL_CHARS || bytes > MAX_HOST_BYTES) {
    throw new Error("Image is still too large after local compression. Use a smaller screenshot.");
  }

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.slice(0, 180),
    mime,
    dataUrl,
    bytes,
    createdAt: Date.now(),
  };
}
