import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listFeaturedDemosTool from "./tools/list-featured-demos";
import getFeaturedDemoTool from "./tools/get-featured-demo";
import generateBuildTool from "./tools/generate-build";
import patchBuildTool from "./tools/patch-build";
import classifyPromptTool from "./tools/classify-prompt";

const supabaseUrl = (process.env.SUPABASE_URL ?? "https://fcdumxxgjnrnolqkishi.supabase.co").replace(/\/+$/, "");

export default defineMcp({
  name: "obsidian-vibe-mcp",
  title: "Obsidian Vibe",
  version: "0.3.0",
  auth: auth.oauth.issuer({
    issuer: `${supabaseUrl}/auth/v1`,
    acceptedAudiences: "authenticated",
    jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  }),
  instructions:
    "Tools for Obsidian Vibe — the AI vibe coder. Every tool requires signing in with an Obsidian account " +
    "(OAuth). `generate_build` creates a full app from a prompt; `patch_build` applies a targeted edit; " +
    "`list_featured_demos`, `get_featured_demo`, `classify_prompt` and `echo` are read-only helpers. " +
    "Builds use the signed-in account's credits.",
  tools: [
    echoTool,
    listFeaturedDemosTool,
    getFeaturedDemoTool,
    classifyPromptTool,
    generateBuildTool,
    patchBuildTool,
  ],
});
