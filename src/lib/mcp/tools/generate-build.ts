/**
 * MCP tool: generate_build
 * Generates a complete HTML application from a prompt.
 * Requires a valid Obsidian Bearer token (Pro account or free daily build).
 * Streams the result and returns the committed HTML.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "generate_build",
  title: "Generate build",
  description:
    "Generate a complete HTML/CSS/JS application from a natural language prompt. " +
    "Returns the committed HTML. Requires an Obsidian account (1 free build/day, " +
    "or Pro for 1,000 credits/month). Pass your Bearer token in the Authorization header " +
    "when calling this tool via the MCP server.",
  inputSchema: {
    prompt: z.string().min(3).max(4000).describe("What to build — describe the app, page, or tool."),
    model: z
      .enum(["auto", "fast", "balanced", "deep"])
      .optional()
      .default("fast")
      .describe("Model tier: 'fast' (default, cheapest), 'balanced' (GPT-5.4-mini), 'deep' (Gemini Pro)."),
    surface: z
      .enum(["ide", "pocket", "mcp"])
      .optional()
      .default("mcp")
      .describe("Which surface is calling this tool (for analytics)."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ prompt, model, surface }, { authToken }) => {
    if (!authToken) {
      return {
        content: [{ type: "text", text: "Authentication required. Pass your Obsidian Bearer token." }],
        isError: true,
      };
    }
    try {
      const origin = process.env.ORIGIN ?? process.env.VITE_PUBLIC_URL ?? "https://obsidianvibe.live";
      const res = await fetch(`${origin}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
          "x-obs-surface": surface ?? "mcp",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          mode: "agent",
          pickerModel: model ?? "fast",
          hasHtml: false,
          advisory: false,
          surface: surface ?? "mcp",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let msg = `Generation failed (${res.status})`;
        try {
          const j = JSON.parse(body);
          msg = j?.message ?? j?.error ?? msg;
        } catch { /* non-JSON error */ }
        return { content: [{ type: "text", text: msg }], isError: true };
      }

      // Consume the SSE / NDJSON stream and extract the committed html event.
      const text = await res.text();
      const lines = text.split("\n");
      let html = "";
      let requestId = "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const raw = line.startsWith("data: ") ? line.slice(6) : line;
        try {
          const ev = JSON.parse(raw) as Record<string, unknown>;
          if (ev.type === "committed" && typeof ev.html === "string") html = ev.html;
          if (ev.type === "complete" && typeof ev.requestId === "string") requestId = ev.requestId;
          if (ev.type === "error" || ev.type === "denial") {
            const errMsg = (ev.message ?? ev.error ?? "Build failed") as string;
            return { content: [{ type: "text", text: errMsg }], isError: true };
          }
        } catch { /* non-JSON line, skip */ }
      }

      if (!html) {
        return { content: [{ type: "text", text: "Build completed but no HTML returned. Try again." }], isError: true };
      }

      return {
        content: [{ type: "text", text: html }],
        structuredContent: {
          html,
          byteSize: html.length,
          requestId: requestId || undefined,
          model: model ?? "fast",
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
