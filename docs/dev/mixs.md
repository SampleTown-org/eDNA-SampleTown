# MIxS 6.3 integration

SampleTown stores sample metadata under MIxS slot names directly and validates
on import against the GSC-maintained LinkML schema. The implementation is
split across:

- `src/lib/mixs/schema/v6.3.0/` — checked-in LinkML YAML + JSON Schema from
  [GenomicsStandardsConsortium/mixs](https://github.com/GenomicsStandardsConsortium/mixs)
- `src/lib/mixs/generated/v6.3.0/` — compact runtime indices (`slots.json`,
  `classes.json`, `enums.json`) produced by `scripts/mixs-build-index.mjs`
- `src/lib/mixs/schema-index.ts` — typed loader (getSlot, getClass,
  requiredSlotsFor, checklistOptions, extensionOptions, …)
- `src/lib/mixs/checklists.ts` — view helpers (CHECKLIST_OPTIONS,
  requiredSlotSet, recommendedSlotSet)
- `src/lib/mixs/fields.ts` — SampleTown-specific UI field grouping
- `src/lib/mixs/sra-mapping.ts` — SRA/BioSample ↔ MIxS column translation
- `src/lib/server/mixs-io.ts` — TSV/xlsx import + export
- `src/lib/server/insdc.ts` — SRA / ENA / GenBank metadata retrieval
- `src/lib/server/mixs-validator.ts` — ajv validator compiled from the
  materialized combination classes

## Version pinning

The active version is declared once in `src/lib/mixs/schema-index.ts`:

```ts
export const MIXS_ACTIVE_VERSION = '6.3.0';
```

Multiple versions can coexist on disk (`src/lib/mixs/schema/v<n>/`,
`src/lib/mixs/generated/v<n>/`). Only the active one is imported into the
runtime; older ones stay available for diffing and for projects that need to
validate against a specific historical schema.

## Checklists and Extensions

MIxS 6.3 organizes metadata around two mixin classes:

- **Checklist** (is_a: Checklist in LinkML) — defines a submission type. The
  v6.3 set is MimarksS, MimarksC, Mims, MimsMisip, Mimag, Misag, MigsBa,
  MigsEu, MigsOrg, MigsPl, MigsVi, Miuvig.
- **Extension** (is_a: Extension, formerly "env_package" pre-6.3) — attaches
  extra suggested/required slots contextualized by environment or domain. The
  v6.3 set: Water, Soil, Sediment, Air, Agriculture, BuiltEnvironment,
  HostAssociated, HumanAssociated, HumanGut, HumanOral, HumanSkin,
  HumanVaginal, MicrobialMatBiofilm, MiscellaneousNaturalOrArtificialEnvironment,
  PlantAssociated, SymbiontAssociated, Wastewater, HydrocarbonResourcesCores,
  HydrocarbonResourcesFluidsSwabs, FoodAnimalAndAnimalFeed,
  FoodFarmEnvironment, FoodFoodProductionFacility, FoodHumanFoods.

A sample declares a checklist (`samples.mixs_checklist`) and optionally an
extension (`samples.extension`). The materialized combination class
`<checklist><extension>` (e.g. `MigsBaWater`) is what drives the required-slot
set at runtime.

The combination matrix is not enforced in the DB — picklists come from the
LinkML schema, not a CHECK constraint, so bumping to a new MIxS release
doesn't need a migration. `schema-index.ts` detects checklists and extensions
dynamically from `is_a` inheritance.

## Reactive required-slot tracking

On the sample new/edit forms, picking a (checklist, extension) pair
recomputes:

- A red `*` on labels of MIxS-required slots (driven by `requiredSlotSet()`)
- The `<MixsCompleteness>` banner showing "N of M required slots filled" plus
  a collapsible list of which slots are missing (flagged with a "not on form"
  pill when the required slot isn't rendered by the default form)

Because required sets come from `classes.json` at build time, adding a new
mandatory slot in a future MIxS release auto-surfaces everywhere without
code changes.

## Export

### From the UI

`/export` → pick a project, checklist, and extension → Preview → Download
TSV. When a (checklist, extension) pair is chosen, column selection and
order come from the materialized combination class's `required` array
(prefixed with `*`) followed by the rest of `properties`, matching the GSC
TSV template convention. When only a checklist is selected, the checklist
mixin's slots are used. Without either, SampleTown falls back to its full
known slot set.

### From the API

```
GET /api/export/mixs?project_id=<id>&checklist=MimarksS&extension=Water&format=tsv
```

Empty cells are emitted as `not collected` (a MIxS-recognized null sentinel
from `InsdcMissingValueEnum`).

## Import

### Supported formats

- **NCBI BioSample xlsx** — column name translation via
  `src/lib/mixs/sra-mapping.ts` (e.g. `organism` → `samp_taxon_id`,
  `host` → `specific_host`, `isolation_source` → `env_medium`,
  `alt` → `elev`, `collected_by` → `collector_name`).
- **GSC MIxS xlsx** — columns are MIxS slot names verbatim, optionally with
  `*` prefixes for required slots (stripped on import).
- **TSV / CSV** — same column rules.

### Dry-run validation

The validate step runs an ajv check of each row against the
`<checklist><extension>` combination class. Errors surface in the preview
UI as structured per-row messages:

```
samp_name · MimarksS + Water
  ├─ env_broad_scale: missing required slot
  ├─ lat_lon: value does not match required pattern ^{lat} {lon}$
  └─ collection_date: value does not match required pattern …
```

Format-level validation (ajv-formats) is intentionally disabled because
the LinkML-generated JSON Schema marks `collection_date` as `date-time`
even though MIxS explicitly allows right-truncated values like `2008-01-23`
or `2008`. Pattern validation still runs and catches real format errors.

### Coercion rules

- `not collected`, `missing`, `not applicable`, `not provided`, and empty
  strings → `NULL`
- Standalone `latitude` + `longitude` columns are composed into a canonical
  `lat_lon` string for storage on the site record
- Unmapped columns route to the column mapper UI, where the user can either
  force a field target or tag them as `custom:<key>` to land in
  `samples.custom_fields` (JSON)

## Import from an accession

`/export` → Import → **From accession** pulls metadata straight out of the
sequence archives instead of a spreadsheet. The fetch produces a TSV in
SampleTown's import columns and hands it to `/api/import/mixs`, so accession
imports and file uploads share one preview, column mapper, MIxS validation,
site-clustering, and insert path.

### Where the records come from

The INSDC archives exchange records daily, so the ENA Portal API answers for
all three: it serves NCBI BioProjects, BioSamples, and GenBank sequence
accessions under their original accessions. The accession's prefix selects
the result set — `read_run` for projects, studies, runs, experiments, and
samples with reads; `sample` for samples without; `sequence` for GenBank and
EMBL records. NCBI eutils is a fallback for BioSamples too new to have been
mirrored, which typically takes a day.

`fields=all` is requested deliberately: submitters fill whichever checklist
fields apply, and there is no way to know the set ahead of time. Empty
columns are dropped per row.

### Entity mapping

| INSDC | SampleTown |
|---|---|
| BioProject | project (named from the study title) |
| BioSample | sample, plus a site from its coordinates |
| Experiment | extract, PCR (amplicon libraries only), library prep |
| Run | sequencing run + `run_libraries` link |

One SRA run is one sequencing event, so each becomes its own run record.
Several runs on one BioSample resolve to a single sample and extract with a
library per run — the importer's existing reuse lookups handle that, and make
re-fetching the same accession idempotent.

A PCR reaction is only created for amplicon libraries (`library_strategy`
AMPLICON, `library_selection` PCR, or a declared `target_gene`). Recording one
for a shotgun metagenome would assert an amplification that never happened.

### Checklist detection

The declared checklist decides which combination class a row is validated
against, rather than whatever the import form was set to:

- NCBI `ncbi_reporting_standard` gives both halves —
  `MIMARKS.survey.water` → `MimarksS` + `Water`
- ENA's GSC checklists (`ERC000012`–`ERC000058`) are the environmental
  packages, so they name an extension; `ERC000047`–`ERC000049` name the
  MIMAG/MISAG/MIUVIG checklists

`ERC000056` (four food packages combined) and `ERC000058` (hydrocarbon, which
splits into cores and fluids/swabs) are left unmapped — they do not resolve to
one extension, and guessing would validate samples against a checklist their
fields were never checked against. Undeclared rows fall back to the form
default.

### What survives the trip

Columns the explicit map doesn't claim are offered to the importer's own
header vocabulary, which knows every MIxS slot, its aliases, and the
SRA/BioSample translations in `sra-mapping.ts`. Recognized ones land as slot
values; the rest are kept as `misc_param:` tags rather than dropped, so a
sample keeps the accessions it came from (`misc_param:sample_accession`,
`misc_param:study_accession`, `misc_param:experiment_accession`, …). Download
URLs, checksums, and byte counts are skipped.

Samples need a site, and sites come from coordinates, so records without
lat/lon cannot be inserted. The fetch counts them and says so up front — it is
the most common reason an accession fetches cleanly and imports nothing.

### Endpoint

```
POST /api/import/insdc   { accessions: "PRJNA644656 SAMN15515801 MZ477765" }
```

Returns `{ tsv, headers, count, warnings, resolved }`. Nothing is inserted —
the caller posts the TSV to `/api/import/mixs`. Max 25 accessions and 10,000
rows per request; rate-limited to 1 request / 3 s / IP, since every call fans
out to EBI and NCBI.

### Endpoint

```
POST /api/import/mixs
```

Multipart form (`file` + `project_id` + optional `column_map`, `people`,
`siteMatchKm`) or JSON body (`{ project_id, tsv, dryRun }`). Rate-limited
to 1 req/sec/IP.

## Glossary

`/glossary` surfaces all 786 MIxS slots from the active version, searchable
by name/title/description/keywords and filterable by LinkML subset
(environment, sequencing, investigation, …). Deep-linkable by slot name:
`/glossary#lat_lon`.

Slot entries show title, description, first example, pattern, slot_uri, and
LinkML subsets. The checklist + extension lists expand to descriptions.

All glossary content is baked into the build from `slots.json`/`classes.json`
— no network required at runtime (ship-safe).

## `<FieldLabel>` component

Drop-in replacement for `<label>`:

```svelte
<FieldLabel slot="env_medium" required={true}>
```

Shows an (i) button that opens a popover with the slot's description,
first example, pattern, and a deep link to the glossary. Falls back to a
plain label when the slot isn't in the active MIxS schema (e.g. SampleTown-
local columns like `collector_name`).

## Upgrading to a new MIxS release

```
npm run mixs:update 6.4.0
```

This:
1. Fetches `mixs.yaml` and `mixs.schema.json` from the
   GenomicsStandardsConsortium/mixs GitHub tag
2. Stages them under `src/lib/mixs/schema/v6.4.0/`
3. Regenerates `src/lib/mixs/generated/v6.4.0/{slots,classes,enums}.json`
4. Emits `.mixs-upgrade-6.4.0.md` — a diff report categorizing changes:
   - **Renamed** slots (identity preserved via stable `slot_uri`)
   - **Added** / **removed** slots
   - **Required-set changes** per class (new mandatory slots, relaxed ones)
   - **Enum changes** (added/removed permissible values)

The script does NOT flip `MIXS_ACTIVE_VERSION`. After reviewing the diff:

1. Write a migration in `schema.sql` for any slot renames where SampleTown
   uses the old name as a column
2. Bump `MIXS_ACTIVE_VERSION` to `'6.4.0'` in `src/lib/mixs/schema-index.ts`
   and update the three JSON import paths
3. Test import/export round-trip
4. Commit the bump

Multiple versions coexisting on disk is expected — the diff script diffs
against whatever `MIXS_ACTIVE_VERSION` points at, not against whatever's
newest on disk.

## SRA ↔ MIxS policy

When a field exists in both vocabularies, MIxS is canonical. The bidirectional
translation table lives in `src/lib/mixs/sra-mapping.ts`:

| SRA/BioSample | MIxS slot |
|---|---|
| `organism` | `samp_taxon_id` |
| `host` | `specific_host` |
| `isolation_source` | `env_medium` |
| `sample_title` / `sample_name` | `samp_name` |
| `alt` | `elev` |
| `collected_by` | `collector_name` |
| `lat_lon` / `collection_date` / `geo_loc_name` / `env_broad_scale` / `env_local_scale` / `env_medium` | (same) |

SRA-only fields with no MIxS counterpart (`library_strategy`, `library_source`,
`library_selection`) stay on their SampleTown experiment/run tables
(`library_plates`, `library_preps`, `sequencing_runs`) and aren't part of the
MIxS round-trip.

For the lossy SRA `platform` ↔ MIxS `seq_meth` direction,
`seqMethToSraPlatform()` pattern-matches the OBI term (e.g. `"Illumina MiSeq
[OBI:0002004]"` → `"ILLUMINA"`).
