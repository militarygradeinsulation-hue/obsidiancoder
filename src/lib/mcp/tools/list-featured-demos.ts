import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { anonSupabase } from "../supabase";

export default defineTool({
  name: "list_featured_demos",
  title: "List featured demos",
  description:
    "List the publicly featured Obsidian Vibe demos (title, slug, category, URL). Optionally filter by category and limit results.",
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe("Optional category filter, e.g. 'App', 'Game', 'Tool'."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of demos to return (default 50, max 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }) => {
    const cap = Math.max(1, Math.min(200, limit ?? 50));
    let q = anonSupabase()
      .from("featured_demos")
      .select("slug, title, category, url, sort_order, created_at")
      .order("sort_order", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(cap);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { demos: data ?? [] },
    };
  },
});
