# SampleTown

MIxS-compliant eDNA sample tracking from field collection to sequencing run. Built for marine research expeditions: works offline at sea, syncs when back on network, and exports directly to NCBI BioSample / SRA submission templates.

Tracks the full chain: **Project → Site → Sample → Extract → PCR → Library Prep → Sequencing Run → Analysis**.

## Features

- **MIxS v6 compliant** — supports the full GSC checklist family (MIMARKS-SU/SP, MIMS, MIMAG, MISAG, MIGS-EU/BA/PL/VI/ORG, MIUViG)
- **NCBI-ready** — import the official BioSample xlsx templates, export TSV that drops into the SRA submission portal
- **Plate-based batch entry** — PCR and library prep are organized around plates (not single reactions), with one form to create a whole plate of reactions in a transaction
- **Constrained vocabularies** — picklist-driven for primers, protocols, kits, instruments, environments, storage locations; managed in-app via the Settings page
- **Linked composites** — primer sets (gene + region + F/R primer + sequence + reference) and PCR protocols (polymerase + annealing + cycles + conditions) live in dedicated tables and are selected as a unit
- **Personnel tracking** — every entity (sample/extract/PCR/library/run) records who did the work, optionally linked to a GitHub-authenticated user
- **Hybrid auth + RBAC** — GitHub OAuth (`arctic`) for normal use, local bcrypt accounts as a LAN-only fallback. All `/api/*` mutations require a session; `/api/settings/*`, `/api/personnel`, `/api/db/*`, and the Settings page require `role=admin`. First admin is bootstrapped via a one-time `ADMIN_SETUP_TOKEN`.
- **Rate limited** — login (5/min/IP), feedback POST (5/h/IP), MIxS import (10/h/IP, 10 MB cap, 10 k row cap)
- **Map picker** — click a location on a Leaflet map when adding a site; dashboard shows all sites as markers
- **Feedback form** — single-line form on the bottom of every page captures the current URL for context
- **GitHub-backed snapshots** — JSON exports of every table can be committed to a configured GitHub repo for version control

## Tech stack

- **SvelteKit 2** + **Svelte 5 runes** + **Tailwind CSS 3**
- **better-sqlite3** with WAL mode
- **arctic** (OAuth) + **bcrypt** (local auth)
- **Leaflet** (maps), **xlsx** / SheetJS (Excel I/O)
- Adapter: `@sveltejs/adapter-node`

## Quick start

```bash
git clone https://github.com/rec3141/SampleTown.git
cd SampleTown
npm install
cp .env.example .env          # edit AUTH_MODE, ORIGIN, secrets as needed
npm run dev                   # http://localhost:5173
```

For production:

```bash
npm run build
node build/index.js           # honors PORT, HOST, ORIGIN env vars
```

The SQLite file is created at `data/sampletown.db` on first run, schema is applied from `src/lib/server/schema.sql`, and constrained-value picklists are seeded from `src/lib/server/seed-constrained-values.ts` (primers, protocols, kits, naming templates, etc.).

## Configuration

`.env` keys (see `.env.example`):

| Key | Purpose |
|---|---|
| `AUTH_MODE` | `local`, `github`, or `hybrid` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GITHUB_REPO` | `owner/repo` for DB snapshot commits |
| `GITHUB_TOKEN` | PAT used by Octokit to push JSON snapshots |
| `DB_PATH` | SQLite file path (default `data/sampletown.db`) |
| `ORIGIN` | Public origin URL — required for SvelteKit CSRF and Secure cookies |

## Auth model

- **Sessions** are server-side rows in `sessions`, looked up by an opaque 32-char hex cookie. Default lifetime is 14 days, no sliding window. Cookies are `httpOnly`, `sameSite=lax`, and `secure` when `ORIGIN` starts with `https://`.
- **GitHub OAuth** is implemented with `arctic`. The `state` parameter is round-tripped through an `httpOnly` cookie and compared with `timingSafeEqual` on the callback. The OAuth App's Authorization callback URL must be `https://<host>/auth/login/github/callback` (full path).
- **Local accounts** use `bcrypt` (cost 12). Username enumeration is mitigated by always running `bcrypt.compare` against a dummy hash on unknown usernames. Passwords are 10–128 characters.
- **API authorization** is enforced centrally in `src/hooks.server.ts`:
  - Anonymous: only `POST /api/feedback`
  - Authenticated: all other `/api/*`
  - Admin: any mutation under `/api/settings/`, `/api/personnel`, `/api/db/`, plus `GET /api/feedback`. The `/settings` page itself is also admin-gated.
- **Bootstrapping the first admin**: SampleTown auto-seeds a default `admin/admin` user on first startup (when the `users` table is empty). The seeded account has `must_change_password=1` so the first login is forced to set a real password before anything else works. **Bootstrap from a private network or SSH tunnel BEFORE exposing the app publicly** — the literal `admin/admin` is exploitable until the first login changes it.

## Repo layout

```
src/
├── lib/
│   ├── server/
│   │   ├── db.ts                       # better-sqlite3 singleton + schema bootstrap
│   │   ├── schema.sql                  # full DDL (inlined via ?raw import)
│   │   ├── seed-constrained-values.ts  # picklist + primer set + protocol seeds
│   │   ├── auth.ts                     # sessions, OAuth, bcrypt, sweep
│   │   ├── guards.ts                   # requireUser / requireAdmin
│   │   ├── api-errors.ts               # safe SQLite-error wrapper
│   │   ├── rate-limit.ts               # in-memory sliding window
│   │   ├── personnel.ts                # active personnel lookup
│   │   ├── constrained-values.ts       # picklist loader
│   │   ├── mixs-io.ts                  # MIxS TSV/xlsx import + export
│   │   └── github.ts                   # Octokit DB-snapshot commits
│   └── components/                     # DataTable, MapPicker, FeedbackForm, ...
└── routes/
    ├── projects/  sites/  samples/     # CRUD pages (list, new, edit, [id])
    ├── extracts/  pcr/  libraries/  runs/  analysis/
    ├── settings/                       # Naming, picklists, primers, protocols, people, feedback
    ├── export/                         # MIxS import / export UI
    └── api/                            # REST endpoints (one folder per resource)
```

## Documentation

- [docs/SCHEMA.md](docs/SCHEMA.md) — data model and table relationships
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Arbutus VM + ship/LAN Docker deployment
- [docs/MIXS.md](docs/MIXS.md) — MIxS import/export and NCBI submission flow

## License

TBD
