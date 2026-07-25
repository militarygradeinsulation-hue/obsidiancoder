import { createClient } from "@supabase/supabase-js";

// Anonymous, publishable-key Supabase client for public MCP tools.
// Reads run under the `anon` role — RLS applies. No service-role key here.
export function anonSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Opaque sb_ keys aren't JWTs — send only apikey, not Bearer.
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}
