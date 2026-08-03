/**
 * MCP tool: patch_build
 * Apply a natural-language edit to an existing HTML build.
 * Uses the AI-patch path (faster, cheaper than full regeneration).
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "patch_build",
  title: "Patch build",
  description:
    "Apply a natural-language instruction to an existing HTML build. " +
    "Cheaper and faster than full regeneration for targeted edits. " +
    "Returns the patched HTML. Requires an Obsidian account.",
  inputSchema: {
    html: z.string().min(10).max(6_000_000).describe("The current HTML to modify."),
    instruction: z.string().min(3).max(2000).describe("What to change — plain English."),
    model: z
      .enum(["auto", "fast", "balanced"])
      .optional()
      .default("fast")
      .describe("Model tier for the patch (default: fast)."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ html, instruction, model }, { authToken }) => {
    if (!authToken) {
      return {
        content: [{ type: "text", text: "Authentication required. Pass your Obsidian Bearer token." }],
        isError: true,
      };
    }
    try {
      const origin = process.env.ORIGIN ?? process.env.VITE_PUBLIC_URL ?? "https://obsidianvibe.live";
      const res = await fetch(`${origin}/api/patch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
          "x-obs-surface": "mcp",
        },
        body: JSON.stringify({
          html,
          instruction,
          model: model ?? "fast",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let msg = `Patch failed (${res.status})`;
        try {
          const j = JSON.parse(body);
          msg = j?.message ?? j?.error ?? msg;
        } catch { /* non-JSON */ }
        return { content: [{ type: "text", text: msg }], isError: true };
      }

      const data = await res.json() as Record<string, unknown>;
      const patchedHtml = (data.html ?? data.committedHtml ?? "") as string;
      if (!patchedHtml) {
        return { content: [{ type: "text", text: "Patch returned no HTML." }], isError: true };
      }

      return {
        content: [{ type: "text", text: patchedHtml }],
        structuredContent: {
          html: patchedHtml,
          byteSize: patchedHtml.length,
          opsApplied: (data.applied as number) ?? undefined,
          summary: (data.summary as string) ?? undefined,
        },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: err instanceof Error ? err.message : "Unexpected error." }],
        isError: true,
      };
    }
  },
});
