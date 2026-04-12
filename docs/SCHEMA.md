# Database schema

The full DDL lives in [`src/lib/server/schema.sql`](../src/lib/server/schema.sql) and is applied automatically by `getDb()` in `src/lib/server/db.ts` on first connection. SQLite, WAL mode, foreign keys on. Picklist data is seeded by `src/lib/server/seed-constrained-values.ts`.

`schema.sql` is the single source of truth — `runMigrations()` is a no-op. For breaking schema changes (column rename, drop, type change) we wipe and re-initialize the DB rather than carrying a migration runner. Backups are snapshotted before any destructive operation.

## Hierarchy

```
project ──┬── site
          │
          └── sample ── extract ──┬── pcr_amplification ── library_prep ──┐
                                  │   (in pcr_plate)        (in           │
                                  │                          library_     │
                                  │                          plate)       │
                                  └──────────────────── library_prep ─────┤
                                              (direct from extract)        │
                                                                           │
                                                              sequencing_run
                                                                           │
                                                                       analysis
```

A library prep can come from either a `pcr_amplification` or directly from an `extract`. The `CHECK (pcr_id IS NOT NULL OR extract_id IS NOT NULL OR library_plate_id IS NOT NULL)` constraint enforces that.

## Core entities

| Table | Purpose | Notes |
|---|---|---|
| `users` | App users | GitHub OAuth + local bcrypt accounts share this table; `is_local_account` distinguishes them |
| `sessions` | Login sessions | 30-day TTL, no sliding window (covers full field expeditions) |
| `oauth_states` | GitHub OAuth state nonces | Separate table so the FK on `sessions.user_id` isn't violated mid-flow |
| `projects` | Top-level container | Has optional `github_repo` for DB snapshots |
| `sites` | Sampling locations | Reusable across many samples; carries default ENVO terms |
| `samples` | MIxS 6.3-aligned physical samples | Column names mirror MIxS LinkML slot names 1:1; `(mixs_checklist, extension)` selects the materialized combination class for required-slot resolution |
| `extracts` | DNA extracts | Each FK'd to one sample |
| `pcr_plates` | PCR plate header | Carries shared plate-level conditions (primers, polymerase, cycling) |
| `pcr_amplifications` | Individual reactions | Always belong to a plate; per-reaction band/concentration |
| `library_plates` | Library prep plate header | Optional `pcr_plate_id` lets you bulk-prep from a PCR plate |
| `library_preps` | Individual libraries | Source is either a PCR amplification or an extract directly |
| `sequencing_runs` | Sequencer runs | Many libraries per run via `run_libraries` |
| `run_libraries` | Junction (run × library) | Holds FASTQ paths and per-library read counts |
| `analyses` | Pipeline runs | Tracks Nextflow session ID + status |

## Personnel attribution

`personnel` is a directory of people who work on the data. Each row optionally `user_id`-links to an authenticated `users` row.

`entity_personnel` is a many-to-many junction table that attributes personnel to entities with a free-text role label (constrained by the `person_role` picklist in the UI, but not enforced at the DB level):

```
entity_personnel (
    entity_type  TEXT NOT NULL CHECK (entity_type IN
        ('sample', 'extract', 'pcr_plate', 'library_plate', 'sequencing_run')),
    entity_id    TEXT NOT NULL,
    personnel_id TEXT NOT NULL REFERENCES personnel(id),
    role         TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_type, entity_id, personnel_id, role)
)
```

The same person can be attributed multiple times with different roles (e.g. "collector" + "lab tech"). The PeoplePicker component on every form writes to this table; the PeopleRoster component on every detail page reads from it.

## CHECK constraints — what's kept vs. dropped

Columns whose values are mandated by an **external standard** retain schema-level CHECK constraints only when the valid set is stable across versions:

| Column | Standard | Values |
|---|---|---|
| `*.platform` | INSDC/SRA | ILLUMINA, OXFORD_NANOPORE, PACBIO, ION_TORRENT [+ 'other' on library tables] |

`samples.mixs_checklist` and `samples.extension` are intentionally NOT CHECK-constrained — the valid set evolves between MIxS releases, and enforcement happens against the active schema index at runtime (`src/lib/mixs/schema-index.ts`). Bumping to a new MIxS release doesn't require a schema migration.

Internal system-state columns also keep CHECKs:

| Column | Values |
|---|---|
| `users.role` | admin, user, viewer |
| `analyses.status` | pending, running, completed, failed, cancelled |
| `feedback.status` | open, resolved, wontfix |
| `sync_log.operation` | INSERT, UPDATE, DELETE |
| `db_snapshots.status` | pending, committed, pushed, failed |
| `entity_personnel.entity_type` | sample, extract, pcr_plate, library_plate, sequencing_run |

All other categorical columns (`pipeline`, `extraction_method`, `library_prep_kit`, `samp_store_sol`, `samp_collect_device`, etc.) are **operator-managed vocabulary** — no schema CHECK, the picklist in `/settings` is the sole source of truth. Zod schemas on the API layer enforce string type + length but not specific values.

MIxS controlled vocabularies (ENVO biomes for `env_broad_scale`, ENVO features for `env_local_scale`, ENVO materials for `env_medium`, country:region for `geo_loc_name`) are picklist-seeded from the LinkML schema and editable in Settings; values are not CHECK-enforced so operators can add site-specific terms.

## Constrained vocabularies

Three patterns:

1. **`constrained_values`** — single table with `(category, value, label, sort_order, is_active)` rows. Categories are grouped in `/settings` by vocabulary authority:
   - **MIxS** — `geo_loc_name`, `locality`, `env_broad_scale`, `env_local_scale`, `env_medium`, `samp_store_sol`, `samp_collect_device`
   - **SRA / ENA** — `library_strategy`, `library_source`, `library_selection`, `seq_platform`, `seq_instrument` (validated against the NCBI SRA_metadata.xlsx vocabulary)
   - **Custom** — `pipeline`, `filter_type`, `storage_room`, `storage_box`, `extraction_method`, `library_prep_kit`, `barcode`, `person_role`, and `naming_template`
   Categories whose values must match a schema CHECK (like `seq_platform`) use `{value, label}` pairs where the value is the canonical string and the label is human-friendly.
2. **`primer_sets`** — composite (gene + region + F/R name + F/R sequence + reference). Selected as a unit on the PCR plate form to populate four primer fields at once.
3. **`pcr_protocols`** — composite (polymerase + annealing temp + cycles + free-text conditions). Selected as a unit on the PCR plate form to populate four protocol fields at once.

All three are managed in `/settings`. Seed data is defined in `seed-constrained-values.ts`. The seed function:
- Seeds each category independently (only when the category has zero rows)
- Back-fills missing entries in existing categories (for when SEED_DATA grows between releases)
- Repairs schema-coupled picklist values that drifted from canonical form (e.g. `seq_platform` "Illumina" → "ILLUMINA")

## Soft deletes

All major entities have `is_deleted INTEGER NOT NULL DEFAULT 0`. List queries always filter `WHERE is_deleted = 0`. Hard deletes only happen on cascade from a parent project deletion.

## Sync metadata

The schema reserves columns for an offline-first sync engine that hasn't fully landed yet:

- `client_id` + `local_created_at` on `samples` (offline IDs from IndexedDB)
- `sync_version` counter on every major table
- `sync_log` audit table (`INSERT`/`UPDATE`/`DELETE`, old/new JSON blobs)
- `db_snapshots` for tracking GitHub commits of JSON exports

## IDs

Every primary key is a 32-char lowercase hex string from `lower(hex(randomblob(16)))`. List pages and Settings tabs surface only the **first 8 characters** of each ID for visual identification — that's enough to disambiguate within a project but stays out of the way.

## Input validation

API request bodies go through a two-layer validation pipeline:

1. **Zod schemas** (`src/lib/server/schemas/auth.ts`, `src/lib/server/schemas/lab.ts`) — type-check, length-cap, enum-whitelist (only for externally mandated enums), and strip unknown fields. Invalid bodies get a 400 with per-field issue messages.
2. **SQLite CHECK constraints** — second line of defense for the externally mandated columns. If zod passes but the CHECK fails (shouldn't happen), the `apiError()` wrapper in `api-errors.ts` returns a safe 400 without leaking SQLite internals.
