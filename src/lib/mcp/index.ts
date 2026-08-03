import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listFeaturedDemosTool from "./tools/list-featured-demos";
import getFeaturedDemoTool from "./tools/get-featured-demo";
import generateBuildTool from "./tools/generate-build";
import patchBuildTool from "./tools/patch-build";
import classifyPromptTool from "./tools/classify-prompt";

export default defineMcp({
  name: "obsidian-vibe-mcp",
  title: "Obsidian Vibe",
  version: "0.2.0",
  instructions:
    "Tools for Obsidian Vibe — the AI vibe coder. " +
    "Public (no auth): `list_featured_demos`, `get_featured_demo`, `classify_prompt`, `echo`. " +
    "Authenticated (Bearer token required): `generate_build` (create a full app from a prompt), " +
    "`patch_build` (apply a targeted edit to existing HTML). " +
    "Free accounts get 1 AI build per day. Pro accounts get 1,000 credits/month. " +
    "Pass your token via the Authorization header when connecting to the MCP server.",
  tools: [
    echoTool,
    listFeaturedDemosTool,
    getFeaturedDemoTool,
    classifyPromptTool,
    generateBuildTool,
    patchBuildTool,
  ],
});
