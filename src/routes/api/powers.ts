import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  isOwnerRequest,
  resolveUserFromRequest,
  hasActivePro,
  serverStripeEnv,
} from "@/lib/credit-gate.server";

/**
 * Paid-member "powers" for the Vibe Coder:
 *   - scrape: Firecrawl reads a reference URL → design brief for the prompt
 *   - image:  Leonardo AI generates an image → hosted URL for the build
 *   - speak:  ElevenLabs reads text aloud → audio/mpeg
 * Access: owner or an active paid plan. Nothing else.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scrape"), url: z.string().url().max(2000) }),
  z.object({ action: z.literal("image"), prompt: z.string().min(3).max(1200), wide: z.boolean().optional() }),
  z.object({ action: z.literal("speak"), text: z.string().min(1).max(2500) }),
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function allowed(request: Request): Promise<"ok" | "auth" | "paid"> {
  if (await isOwnerRequest(request)) return "ok";
  const user = await resolveUserFromRequest(request);
  if (!user) return "auth";
  return (await hasActivePro(user, serverStripeEnv())) ? "ok" : "paid";
}

async function scrape(url: string) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return json({ error: "Build from URL isn't configured yet." }, 503);
  if (!/^https?:\/\//i.test(url)) return json({ error: "Use a full web address starting with http." }, 400);
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const data = await res.json().catch(() => null) as any;
  if (!res.ok || !data?.success) {
    return json({ error: data?.error || `Couldn't read that site (${res.status}).` }, res.status === 402 ? 402 : 502);
  }
  const md: string = data.data?.markdown ?? "";
  const meta = data.data?.metadata ?? {};
  const headings = md.split("\n").filter((l) => /^#{1,3}\s/.test(l)).slice(0, 18).map((l) => l.replace(/^#+\s*/, "").slice(0, 80));
  const brief = [
    `Reference site: ${url}`,
    meta.title ? `Title: ${String(meta.title).slice(0, 120)}` : "",
    meta.description ? `Purpose: ${String(meta.description).slice(0, 240)}` : "",
    headings.length ? `Section structure: ${headings.join(" → ")}` : "",
  ].filter(Boolean).join("\n");
  return json({ brief, title: meta.title ?? null });
}

async function image(prompt: string, wide?: boolean) {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) return json({ error: "AI images aren't configured yet." }, 503);
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
  const start = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      modelId: "b24e16ff-06e3-43eb-8d33-4416c2d75876", // Leonardo Lightning XL
      width: wide ? 1472 : 1024,
      height: wide ? 832 : 1024,
      num_images: 1,
    }),
  });
  const s = await start.json().catch(() => null) as any;
  const id = s?.sdGenerationJob?.generationId;
  if (!start.ok || !id) return json({ error: s?.error || `Image request failed (${start.status}).` }, start.status === 402 ? 402 : 502);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${id}`, { headers });
    const p = await poll.json().catch(() => null) as any;
    const g = p?.generations_by_pk;
    if (g?.status === "FAILED") return json({ error: "The image couldn't be created. Try a different description." }, 502);
    const url = g?.generated_images?.[0]?.url;
    if (g?.status === "COMPLETE" && url) return json({ url });
  }
  return json({ error: "The image is taking too long. Try again in a moment." }, 504);
}

async function speak(text: string) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "Read-aloud isn't configured yet." }, 503);
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ error: t.slice(0, 200) || `Read-aloud failed (${res.status}).` }, 502);
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/powers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await allowed(request);
        if (gate === "auth") return json({ code: "auth_required", message: "Sign in to use Obsidian powers." }, 401);
        if (gate === "paid") return json({ code: "not_pro", message: "Build from URL, AI images and read-aloud are for paid members." }, 402);
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid request." }, 400);
        const b = parsed.data;
        try {
          if (b.action === "scrape") return await scrape(b.url);
          if (b.action === "image") return await image(b.prompt, b.wide);
          return await speak(b.text);
        } catch {
          return json({ error: "That service didn't respond. Try again shortly." }, 502);
        }
      },
    },
  },
});
