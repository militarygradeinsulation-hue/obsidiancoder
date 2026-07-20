// Intro asset resolver — validates that the bundled asset pointer is well
// formed and returns a usable URL. Pure, safe for tests and SSR.

import videoAsset from "@/assets/obsidian-intro.mp4.asset.json";

export type AssetResolution = {
  ok: boolean;
  url: string;
  contentType?: string;
  reason?: string;
};

export function resolveIntroVideo(): AssetResolution {
  const a = videoAsset as unknown as {
    url?: string; content_type?: string; original_filename?: string;
  };
  if (!a || typeof a !== "object") {
    return { ok: false, url: "", reason: "asset pointer missing" };
  }
  const url = typeof a.url === "string" ? a.url : "";
  if (!url) return { ok: false, url: "", reason: "asset url missing" };
  if (!/^\/__l5e\/assets-v1\//.test(url) && !/^https?:\/\//.test(url)) {
    return { ok: false, url, reason: `unexpected asset url shape: ${url.slice(0, 60)}` };
  }
  const contentType = typeof a.content_type === "string" ? a.content_type : undefined;
  if (contentType && !/^video\//.test(contentType)) {
    return { ok: false, url, contentType, reason: `non-video content-type: ${contentType}` };
  }
  return { ok: true, url, contentType };
}
