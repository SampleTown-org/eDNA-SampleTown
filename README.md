# SampleTown

MIxS-compliant eDNA sample tracking from field collection to sequencing run. Built for marine research expeditions: works offline at sea, syncs when back on network, and exports directly to NCBI BioSample / SRA submission templates.

Tracks the full chain: **Project → Site → Sample → Extract → PCR → Library Prep → Sequencing Run → Analysis**.

## Features

### Data model
- **MIxS 6.3 native** — column names mirror LinkML slot names 1:1; full GSC checklist family (MimarksS/C, Mims, MimsMisip, Mimag, Misag, MigsBa/Eu/Org/Pl/Vi, Miuvig) × 23 extensions (Water, Soil, Sediment, HostAssociated, …) = 276 materialized combination classes driving required-slot validation
- **Live MIxS completeness** — pick a (checklist, extension) on a sample form and the UI reactively highlights required slots with a red `*`, shows "N of M filled" progress, and flags missing required slots; import validates each row with ajv against the materialized combination class
- **Searchable MIxS glossary** — `/glossary` reference for all 786 slots, deep-linkable by slot name, ships baked-in for offline ship use
- **NCBI-ready** — import the official BioSample xlsx templates with automatic SRA↔MIxS column translation; export TSV columns ordered and `*`-marked per the GSC combination-class template
- **Mechanical MIxS upgrades** — `npm run mixs:update 6.4.0` fetches a new release, rebuilds runtime indices, and emits a diff report identifying renamed / added / removed / required-tightened slots by stable `slot_uri`

### Entry workflows
- **Plate-based batch entry** — PCR and library prep are organized around plates (not single reactions), with one form to create a whole plate of reactions in a transaction
- **Transposed sample batch** — `/samples/batch` is the one-stop form for both single and bulk sample entry: parameters as rows, samples as columns, fill-right shortcuts, picklist widgets for every constrained slot, drag-paste from spreadsheets
- **Constrained vocabularies** — picklist-driven for target genes, library types, pipelines, primers, protocols, kits, instruments, environments, storage locations, person roles; managed in-app via the Settings page. Only SRA/MIxS-mandated values have schema-level CHECK constraints; everything else is fully operator-managed.
- **Linked composites** — primer sets (gene + region + F/R primer + sequence + reference) and PCR protocols (polymerase + annealing + cycles + conditions) live in dedicated tables and are selected as a unit
- **Multi-person attribution** — every entity can have any number of attributed personnel, each with a role label from the `person_role` picklist. PeoplePicker on forms, PeopleRoster chips on detail pages, text summary column on list pages

### Field workflow
- **QR scanner + label generator** — every entity gets an auto-generated QR on its detail page; `/settings` → Labels prints Avery 5160 sticker sheets as PDF (cart-backed labels with name/project/ID or blank pre-allocated UUIDs, optionally pre-typed so a scan skips the claim picker); an in-nav scanner opens the camera, decodes a pre-printed sticker, and routes to either the entity's detail page or its claim/create flow
- **Photo galleries** — per-site and per-sample photo galleries (JPEG/PNG/WebP/GIF up to 15 MB), uploaded from the detail page or staged alongside batch sample entry; EntityQR and photo-count surface on list pages; click-to-enlarge lightbox
- **Map tooling** — Leaflet map on `/sites` and `/samples` with click-to-place, shift+box-drag multi-select to cart, color-by via shift+click on a table header, rank-based hue gradient so ordered columns read as gradients
- **Saved carts** — build a cart across any entity types, save it with a name, optionally make it public so other users can load it. Cart UI is a side column on desktop and a dismissible drawer on mobile
- **Mobile browse** — read-only UI on phones: list pages, detail pages, maps, and the scanner all work; creation/edit buttons are hidden. Field data entry is desktop (or the future offline PWA) only

### Ops
- **Hybrid auth + RBAC** — GitHub OAuth (`arctic`) for normal use, local bcrypt accounts as a LAN-only fallback. All `/api/*` mutations require a session; settings writes require `role=admin`; `role=viewer` is read-only everywhere. First admin is bootstrapped by seeding `admin/admin` on an empty DB (forced password change on first login)
- **Rate limited** — login (5/min/IP), feedback POST (5/min/IP), MIxS import (10/h/IP, 10 MB cap, 10 k row cap)
- **Dashboard activity log** — every entity creation + modification flows into a single searchable activity list on the dashboard, with a calendar-grid view, per-user attribution, and full-text search across name/ID/type/date
- **Feedback form** — single-line form on the bottom of every page captures the current URL for context; admins triage in `/settings` → Feedback
- **GitHub-backed snapshots** — JSON exports of every table can be committed to a configured GitHub repo for version control

## Tech stack

- **SvelteKit 2** + **Svelte 5 runes** + **Tailwind CSS 3**
- **better-sqlite3** with WAL mode
- **arctic** (OAuth) + **bcrypt** (local auth)
- **Leaflet** (maps), **xlsx** / SheetJS (Excel I/O)
- **html5-qrcode** (camera scanner), **qrcode** + **jspdf** (label generation)
- Adapter: `@sveltejs/adapter-node`

## Quick start

```bash
git clone https://github.com/sampletown-org/edna-sampletown.git
cd edna-sampletown
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
| `BODY_SIZE_LIMIT` | Max request body size in bytes (default 512 KB — bump to ≥15 MB if you use photo uploads) |

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
│   │   ├── db.ts                       # better-sqlite3 singleton + schema bootstrap + migrations
│   │   ├── schema.sql                  # full DDL (inlined via ?raw import)
│   │   ├── seed-constrained-values.ts  # picklist + primer set + protocol seeds + backfill
│   │   ├── schemas/
│   │   │   ├── auth.ts                 # zod schemas for user/personnel endpoints
│   │   │   └── lab.ts                  # zod schemas for runs/plates/PCR endpoints
│   │   ├── validation.ts               # parseBody() zod helper
│   │   ├── auth.ts                     # sessions, OAuth, bcrypt, sweep
│   │   ├── guards.ts                   # requireUser / requireAdmin
│   │   ├── api-errors.ts               # safe SQLite-error wrapper
│   │   ├── rate-limit.ts               # in-memory sliding window
│   │   ├── entity-personnel.ts         # set/get/bulk personnel attribution
│   │   ├── personnel.ts                # active personnel lookup
│   │   ├── constrained-values.ts       # picklist loader
│   │   ├── mixs-io.ts                  # MIxS TSV/xlsx import + export
│   │   ├── mixs-validator.ts           # server-only ajv validator against LinkML JSON Schema
│   │   └── github.ts                   # Octokit DB-snapshot commits
│   ├── mixs/
│   │   ├── schema/v6.3.0/              # checked-in LinkML YAML + JSON Schema + VERSION
│   │   ├── generated/v6.3.0/           # compact runtime indices (slots/classes/enums.json)
│   │   ├── schema-index.ts             # typed loader (getSlot, requiredSlotsFor, …)
│   │   ├── checklists.ts               # CHECKLIST_OPTIONS, EXTENSION_OPTIONS, requiredSlotSet
│   │   ├── fields.ts                   # UI field grouping (view over schema-index)
│   │   ├── validators.ts               # client-side form-level MIxS validation
│   │   └── sra-mapping.ts              # SRA/BioSample ↔ MIxS column translation
│   └── components/
│       ├── DataTable.svelte            # sortable, filterable, color-by table
│       ├── MapPicker.svelte            # Leaflet map with click-to-place + colored markers
│       ├── PeoplePicker.svelte         # chip-list for attributing personnel + roles
│       ├── PeopleRoster.svelte         # read-only chip-list for detail pages
│       ├── PlateView.svelte            # 8/96/384-well visual layout
│       ├── MixsCompleteness.svelte     # reactive MIxS-required-slot progress banner
│       ├── FieldLabel.svelte           # <label> with (i) popover pulling MIxS slot docs
│       └── FeedbackForm.svelte         # persistent form in bottom-right corner
└── routes/
    ├── projects/  sites/  samples/     # CRUD pages (list, new, edit, [id])
    ├── extracts/  pcr/  libraries/  runs/  analysis/
    ├── settings/                       # Naming, picklists, primers, protocols, people, feedback
    ├── export/                         # MIxS import / export UI
    ├── glossary/                       # searchable MIxS slot reference
    └── api/                            # REST endpoints (one folder per resource)

scripts/
├── mixs-build-index.mjs                # YAML → runtime JSON indices
└── mixs-update.mjs                     # fetch a new MIxS release + diff report
```

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — release notes
- [docs/SCHEMA.md](docs/SCHEMA.md) — data model and table relationships
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — long-running VM + ship/LAN install
- [docs/MIXS.md](docs/MIXS.md) — MIxS import/export and NCBI submission flow

## License

TBD
