# MIxS import & export

SampleTown speaks the GSC MIxS v6 standard and the NCBI BioSample submission packages on top of it. The implementation lives in [`src/lib/server/mixs-io.ts`](../src/lib/server/mixs-io.ts), surfaced through the **Import / Export** page.

## Checklists supported

```
MIMARKS-SU   amplicon survey
MIMARKS-SP   specimen
MIMS         metagenome
MIMAG        metagenome-assembled genome
MISAG        single amplified genome
MIGS-EU      eukaryotic genome
MIGS-BA      bacterial / archaeal genome
MIGS-PL      plant-associated
MIGS-VI      viral
MIGS-ORG     organelle
MIUViG       uncultivated virus
```

The active checklist is stored per sample as `samples.mixs_checklist` and drives which fields are required at validation time.

## Export

### From the UI

`/export` → Export tab → pick a project (or "all"), pick a checklist filter, hit **Preview** to see the rendered table, then **Download TSV**. The downloaded file uses MIxS v6 structured comment names as headers (e.g. `*sample_name`, `*lat_lon`, `env_broad_scale`, `samp_vol_we_dna_ext`), with `*` prefixes denoting MIxS-required fields.

### From the API

```
GET /api/export/mixs?project_id=<id>&checklist=MIMARKS-SU&format=tsv
```

Returns TSV with `Content-Disposition: attachment`. `format` can be `tsv` (default) or `xlsx`.

### Header mapping

`mixs-io.ts` defines an `EXPORT_COLUMNS` array that maps each output column to an internal field. Notable mappings:

| MIxS header | Internal field |
|---|---|
| `*sample_name` | `samp_name` |
| `*organism` | `samp_taxon_id` (defaults to `metagenome`) |
| `*lat_lon` | `lat_lon` |
| `alt` / `elev` | `elevation` (both NCBI aliases supported) |
| `samp_vol_we_dna_ext` | `volume_filtered_ml` |
| `samp_store_sol` | `preservation_method` |
| `samp_store_temp` | `storage_conditions` |
| `collected_by` | `collector_name` |
| `diss_oxygen` | `dissolved_oxygen` |

Empty cells are exported as `not collected` (a MIxS-recognized null value).

## Import

### From the UI

`/export` → Import tab → upload an `.xlsx`, `.tsv`, or `.csv` file → **Validate** runs a dry parse and shows the row count, the parsed samples, and any warnings (unmapped headers, missing required fields, lat_lon parse failures). If it looks right, **Import** commits everything in a single transaction.

### Supported formats

- **NCBI BioSample xlsx templates** — the official packages from <https://www.ncbi.nlm.nih.gov/biosample/docs/packages/>. Comment rows starting with `#` are skipped, the `*` markers on required headers are stripped, and NCBI-only columns (`bioproject_accession`, `strain`, `isolate`, etc.) are silently dropped via `_skip_` mappings.
- **GSC MIxS v6 xlsx** — the official `mixs_v6.xlsx` from <https://github.com/GenomicsStandardsConsortium/mixs/raw/refs/heads/main/release/excel/mixs_v6.xlsx>.
- **TSV / CSV** — same column headers as above, plus or minus the `*` prefixes.

### Coercion rules

- `not collected`, `missing`, `not applicable`, `not provided`, and empty strings → `NULL`
- `lat_lon` strings (`50.123 N 65.456 W`) are parsed into separate `latitude` / `longitude` columns for indexing/mapping. If only `latitude` and `longitude` columns are provided, the canonical `lat_lon` string is composed.
- Date strings are passed through as-is — MIxS expects ISO 8601, the schema doesn't enforce.

### From the API

```
POST /api/import/mixs
```

Two body forms:

- `multipart/form-data` with a `file` field containing the xlsx/tsv. The server reads it via `xlsxToTsv(buffer)` if the filename ends in `.xlsx` / `.xls`, otherwise as text.
- `application/json` with `{ project_id, tsv, dry_run }` for direct TSV body.

Pass `dry_run=true` to validate without writing.

## Adding a new column

1. Add the column to the `samples` DDL in `src/lib/server/schema.sql`
2. Add an entry to `EXPORT_COLUMNS` in `mixs-io.ts` mapping the MIxS header to the new field
3. Add any NCBI alias headers to `headerToField` in `parseMixsTsv`
4. (Optional) Add it to `MEASUREMENT_FIELDS` / `LOGISTICS_FIELDS` in `src/lib/mixs/fields.ts` so it shows up in the sample form

The schema is re-applied on every `getDb()` boot via the inlined `schema.sql?raw` import, so adding a column with `ALTER TABLE samples ADD COLUMN ...` and a guard wrapper is enough — no migration runner required for additive changes.
