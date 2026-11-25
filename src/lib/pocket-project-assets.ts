export interface PocketProjectAsset {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  storagePath?: string;
  localOnly?: boolean;
}

export interface PocketProjectAssetDraft {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

export const POCKET_ASSET_MAX = 8;
export const POCKET_ASSET_TOKEN_PREFIX = "obsidian-asset://";

type StoredAsset = PocketProjectAsset & {
  key: string;
  scope: string;
  /** Backward compatibility for assets saved before hosted URLs existed. */
  dataUrl?: string;
};

const DB_NAME = "obsidian-pocket-assets";
const DB_VERSION = 1;
const STORE = "images";
const SCOPE_INDEX = "scope";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Could not open image storage."));
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction!.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: "key" });
      if (!store.indexNames.contains(SCOPE_INDEX)) {
        store.createIndex(SCOPE_INDEX, "scope", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function assetKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}

export function pocketAssetToken(id: string): string {
  return POCKET_ASSET_TOKEN_PREFIX + id;
}

export function resolvePocketAssetTokens(html: string, assets: readonly PocketProjectAsset[]): string {
  let out = html;
  for (const asset of assets) {
    const token = pocketAssetToken(asset.id);
    if (out.includes(token)) out = out.split(token).join(asset.url);
  }
  return out;
}

export async function listPocketProjectAssets(scope: string): Promise<PocketProjectAsset[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const index = tx.objectStore(STORE).index(SCOPE_INDEX);
      const req = index.getAll(IDBKeyRange.only(scope));
      req.onerror = () => reject(req.error ?? new Error("Could not read project images."));
      req.onsuccess = () => {
        const rows = (req.result ?? []) as StoredAsset[];
        resolve(
          rows
            .map((row) => ({
              id: row.id,
              name: row.name,
              url: row.url || row.dataUrl || "",
              createdAt: row.createdAt,
              storagePath: row.storagePath,
              localOnly: row.localOnly ?? !row.url,
            }))
            .filter((asset) => !!asset.url)
            .sort((a, b) => a.createdAt - b.createdAt),
        );
      };
    });
  } finally {
    db.close();
  }
}

export async function savePocketProjectAsset(scope: string, asset: PocketProjectAsset): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.onerror = () => reject(tx.error ?? new Error("Could not save project image."));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE).put({ ...asset, scope, key: assetKey(scope, asset.id) } satisfies StoredAsset);
    });
  } finally {
    db.close();
  }
}

export async function deletePocketProjectAsset(scope: string, id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.onerror = () => reject(tx.error ?? new Error("Could not remove project image."));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE).delete(assetKey(scope, id));
    });
  } finally {
    db.close();
  }
}
