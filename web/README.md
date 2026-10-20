# Coach Tools — React app (`/v2`)

The React rewrite of `coach-tools-deploy/index.html`, built section by section
(see the project doc `claude/specs/react-rewrite-scope.md`). Served at `/v2`
on the same Netlify site while the current app stays at `/`.

- Stack: Vite, React 18, TypeScript, React Router, TanStack Query, supabase-js, vite-plugin-pwa.
- Build: `scripts/build-web.sh` (run by Netlify) builds this folder into `coach-tools-deploy/v2`.
  Deploy previews point at the staging Supabase project.
- Access: `src/lib/access.ts` mirrors the roles × sections matrix; RLS remains the real control.
- Sections not yet rebuilt open in the current app via `/?go=<section>`.
- Schema types: `src/lib/database.types.ts`, regenerate after each migration.

Local: `npm install && npm run dev`, then open http://localhost:5173/v2/
