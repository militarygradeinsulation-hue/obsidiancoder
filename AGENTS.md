<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Obsidian Brain (`src/lib/obsidian-brain.ts`) is a read-only facade over existing learning stores; it owns no storage and never calls a model — why: one brain, no duplicate data.
- Shared project identity lives in `src/lib/current-project.ts` (pointer only) and missions hand off to Studio via its composer — why: every mode works on the same project.
- Per-user account connections (Connections Hub) store safe metadata in `connected_accounts` (owner-read RLS) and AES-GCM owner-bound tokens in service-role-only `connection_token_vault`; OAuth state is hashed, single-use, bound to the starting browser by an HttpOnly `__Host-` nonce cookie, and consumed only via `consume_connection_oauth_state_v2` (state + binding hash) — why: provider tokens never reach the browser, links can't be replayed, and a shared authorize URL can't bind a victim's account to another user. The old 2-arg consumer is retired and always returns NULL.
- Full App workspaces persist locally via `src/lib/fullapp-local.ts` (IndexedDB durable copy, small localStorage hot snapshot, hydrate never clobbers edits); concept-planner results are cached per signed-in user via `src/lib/plan-cache.ts` (SHA-256 key over prompt+model+policy+user, sanitized concept fields only, bounded TTL/LRU) — why: large workspaces survive reloads and repeat planner calls are skipped without sharing data across accounts. Browser storage is device-local, unencrypted and evictable; cloud stays the source of truth.
