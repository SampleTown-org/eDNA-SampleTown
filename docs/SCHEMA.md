# Database schema

The full DDL lives in [`src/lib/server/schema.sql`](../src/lib/server/schema.sql) and is applied automatically by `getDb()` in `src/lib/server/db.ts` on first connection. SQLite, WAL mode, foreign keys on. Picklist data is seeded by `src/lib/server/seed-constrained-values.ts`.

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
| `sites` | Sampling locations | Reusable across many samples; carries default ENVO terms and env_package |
| `samples` | MIxS-compliant physical samples | `mixs_checklist` selects which checklist's required fields apply |
| `extracts` | DNA extracts | Each FK'd to one sample |
| `pcr_plates` | PCR plate header | Carries shared plate-level conditions (primers, polymerase, cycling) |
| `pcr_amplifications` | Individual reactions | Always belong to a plate; per-reaction band/concentration |
| `library_plates` | Library prep plate header | Optional `pcr_plate_id` lets you bulk-prep from a PCR plate |
| `library_preps` | Individual libraries | Source is either a PCR amplification or an extract directly |
| `sequencing_runs` | Sequencer runs | Many libraries per run via `run_libraries` |
| `run_libraries` | Junction (run × library) | Holds FASTQ paths and per-library read counts |
| `analyses` | Pipeline runs | `pipeline IN ('danaseq','microscape-nf','custom')`, tracks Nextflow session ID + status |

## MIxS checklists

`samples.mixs_checklist` is checked against the GSC checklist family:

```
MIMARKS-SU, MIMARKS-SP, MIMS,
MIMAG, MISAG,
MIGS-EU, MIGS-BA, MIGS-PL, MIGS-VI, MIGS-ORG,
MIUViG
```

The choice drives which fields are required at export time (validated in `mixs-io.ts`).

`samples.env_package` is checked against:

```
water, soil, sediment, host-associated,
air, built, plant-associated, agriculture
```

Some fields are conditionally required based on the package — e.g. `depth` for water/sediment, `elevation` for soil/air, `host_taxon_id` for host-associated.

## Constrained vocabularies

Three patterns:

1. **`constrained_values`** — single table with `(category, value, label, sort_order, is_active)` rows. Categories include: `habitat_type`, `geo_loc_name`, `locality`, `env_broad_scale`, `env_local_scale`, `env_medium`, `sample_type`, `filter_type`, `preservation_method`, `storage_conditions`, `storage_room`, `storage_box`, `extraction_method`, `extraction_kit`, `library_prep_kit`, `library_type`, `seq_platform`, `seq_instrument`, `seq_method`, `index_i7`, `index_i5`, `barcode`, and `naming_template` (used to drive ghost text on every form).
2. **`primer_sets`** — composite (gene + region + F/R name + F/R sequence + reference). Selected as a unit on the PCR plate form to populate four primer fields at once.
3. **`pcr_protocols`** — composite (polymerase + annealing temp + cycles + free-text conditions). Selected as a unit on the PCR plate form to populate four protocol fields at once.

All three are managed in `/settings`. Adding picklist categories requires no schema changes.

## Personnel

`personnel` is a directory of people who work on the data. Each row optionally `user_id`-links to an authenticated `users` row, so a GitHub-authed user can be the same person as a "Field Tech" in the personnel directory. Every entity that records "who did this" stores a personnel ID:

| Entity | FK column |
|---|---|
| `samples` | `collector_id` |
| `extracts` | `extracted_by` |
| `pcr_plates` | `pcr_operator` |
| `library_plates` | `prepped_by` |
| `sequencing_runs` | `sequenced_by` |

These were added via `ALTER TABLE` statements after the personnel table, so older databases pick them up on next bootstrap.

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
