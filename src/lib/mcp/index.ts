import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listFeaturedDemosTool from "./tools/list-featured-demos";
import getFeaturedDemoTool from "./tools/get-featured-demo";

export default defineMcp({
  name: "obsidian-vibe-mcp",
  title: "Obsidian Vibe",
  version: "0.1.0",
  instructions:
    "Public tools for Obsidian Vibe. Use `list_featured_demos` to browse the public gallery of Obsidian builds, `get_featured_demo` to fetch one by slug, and `echo` to verify connectivity. These tools expose only intentionally public data — no per-user builds, ideas, or account information.",
  tools: [echoTool, listFeaturedDemosTool, getFeaturedDemoTool],
});
