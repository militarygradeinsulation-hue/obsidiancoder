import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { anonSupabase } from "../supabase";

export default defineTool({
  name: "get_featured_demo",
  title: "Get featured demo",
  description: "Fetch a single publicly featured Obsidian Vibe demo by slug.",
  inputSchema: {
    slug: z.string().min(1).describe("Unique slug of the featured demo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug }) => {
    const { data, error } = await anonSupabase()
      .from("featured_demos")
      .select("slug, title, category, url, sort_order, created_at")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: `No demo found for slug: ${slug}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { demo: data },
    };
  },
});
