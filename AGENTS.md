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
