// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import fs from "node:fs";
import path from "node:path";

// entities@4 lives at node_modules/entities with flat installers (bun, npm),
// which is how Lovable builds. pnpm keeps it under node_modules/.pnpm, so the
// old hardcoded path broke every non-Lovable build. Resolve wherever it is.
function entitiesDir(): string {
  const flat = path.resolve(__dirname, "node_modules/entities");
  if (fs.existsSync(path.join(flat, "lib/decode.js"))) return flat;
  const store = path.resolve(__dirname, "node_modules/.pnpm");
  if (fs.existsSync(store)) {
    const hit = fs.readdirSync(store).filter((d) => d.startsWith("entities@4.")).sort().pop();
    if (hit) return path.join(store, hit, "node_modules/entities");
  }
  return flat;
}
const ENTITIES = entitiesDir();
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Load ALL env vars (no prefix) into process.env for server routes.
// Do NOT expose these to the client bundle via envDefine.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.join(ENTITIES, "lib/decode.js"),
        "entities/lib/encode.js": path.join(ENTITIES, "lib/encode.js"),
        entities: ENTITIES,
      },
    },
  },
});
