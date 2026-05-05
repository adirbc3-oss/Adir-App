# AGENTS.md — App_React (ADIR)

## Stack
- React 19 + Vite 7, plain JS/JSX (no TypeScript)
- React Router 7, lucide-react icons
- No test framework configured

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` (→ localhost:5173) |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Preview build | `npm run preview` |

## Architecture
- **SPA with client-side routing.** `src/App.jsx` defines all routes.
- `/` redirects to `/nuevo`. Default route: `NuevoProyecto` (BC3 file upload/processing).
- **Pages:** `src/pages/` — 9 pages (NuevoProyecto, Borradores, BandejaEntrada, JefesObra, Proyectos, Proveedores, Comparativa, Ajustes, Portal).
- **Utils:** `src/utils/` — `bc3Parser.js` (FIEBDC-3 parsing), `aiAllocation.js` (AI trade assignment via Transformers.js), `supabaseClient.js`.
- **`/portal` route** renders standalone without sidebar (supplier-facing view).
- **`backup/`** contains config JSONs and a projects subdirectory (not source code).

## Backend Services
This app depends on **three external services**:
1. **Google Apps Script** — primary DB for bids/projects. URL in `src/config.js` (`API_URL`).
2. **Local FastAPI** — runs at `localhost:8000/api` (`BASE_URL_LOCAL` in `src/config.js`). Used for backup and email operations only.
3. **Supabase** — used by `aiAllocation.js` for historical trade assignment lookups.

## Environment
- `.env` is gitignored. Required vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Missing Supabase vars cause a console error but the app still loads.
- Vite env vars must use the `VITE_` prefix to be accessible in client code.

## Key Libraries
- **`@xenova/transformers`** — runs AI model locally in browser (~45MB download on first use).
- **`jspdf` + `jspdf-autotable`** — PDF report generation.
- **`xlsx`** — Excel file reading/writing.
- **`axios`** — HTTP requests to external services.

## Conventions
- Language: Spanish (UI text, comments, variable names).
- ESLint flat config: `no-unused-vars` ignores identifiers matching `^[A-Z_]` (constants/component refs).
- No typecheck step — plain JavaScript.
- CSS is global (`App.css`, `index.css`) with Glassmorphism styling.
