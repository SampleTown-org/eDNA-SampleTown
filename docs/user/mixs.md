# MIxS export & import

SampleTown's whole point is to make the round-trip with NCBI BioSample
+ SRA submission templates as close to copy-paste as possible.

Hub for everything MIxS-related:

- **Manage → Tools → Import / Export** — the `/export` page (despite
  the name, it does both)
- **Manage → Tools → MIxS Glossary** — the `/glossary` reference for
  every MIxS slot

## Glossary

The glossary lists every one of the 786 MIxS 6.3 slots in a searchable
table. Filter by:

- **Free-text** name search
- **Subset** (chemistry / climate / sampling / sequencing / …)
- **Checklist** — narrow to slots that appear in `MimarksS`, `Mimag`,
  etc.
- **Extension** — narrow to slots that appear in `Water`, `Soil`,
  `HostAssociated`, etc.
- **Combination** (checklist × extension) — show only the slots that
  appear in this exact GSC template

Each slot row links to its LinkML definition with full description,
type, expected pattern, examples, and the templates it appears in.
This is the source of truth for "what does this column mean" — every
form's tooltip popover (the small (i) icon next to a label) pulls
from the same data.

The glossary ships baked-in to the build; works offline at sea.

## Export

Pick a project (optional), checklist, and extension. Preview shows the
column header row + the first few data rows.

**Column selection** comes from the MIxS combination class:

- Required slots come first, marked with a leading `*` (per GSC template
  convention)
- Optional slots follow in declared order
- `samp_name` is always first regardless of declaration order
- `project_name` comes from the joined projects table, not stored
  redundantly per sample
- `nucl_acid_ext`, `nucl_acid_amp`, `samp_taxon_id`,
  `samp_vol_we_dna_ext`, `pool_dna_extracts` are joined in at export
  time from the most-recent extract / pcr_plate per sample (those slots
  describe the DNA, not the physical collection — they live downstream)

Download as `.tsv`. Drop into NCBI BioSample with no further editing.

## Import

Two modes:

1. **TSV** — paste any MIxS TSV (or upload as `.txt`/`.tsv`)
2. **xlsx** — drop in an NCBI BioSample template `.xlsx` directly. The
   server parses it via SheetJS, converts to TSV internally, then runs
   the same column mapper.

### Column mapping

The first import step shows a column-mapper table:

- Each header in your file is matched against the MIxS slot vocabulary
  (case-insensitive, with SRA/BioSample column aliases handled — e.g.
  `*sample_name` → `samp_name`, `lat_lon` stays `lat_lon`)
- Headers we couldn't auto-map are flagged for manual mapping (or
  `_skip_`)
- The mapper UI lets you pick from the full ~786 MIxS slot list +
  SampleTown-local fields (`site_name`, `notes`, `collector_name`,
  etc.)
- Headers that match no MIxS slot but look intentional get parked under
  a `misc_param:<tag>` — stored in the `sample_values` EAV table so the
  data isn't lost

### Validation

Per-row ajv validation against the active MIxS combination class's
JSON Schema. Errors flow back to the dry-run UI inline with the row,
so you can fix in place before committing. Missing required fields,
out-of-pattern lat_lon, enum violations all surface here.

### Site clustering

Imported samples that have lat/lng but no matching existing site get
auto-clustered: samples within a configurable radius (default 1 km) of
each other share a freshly-created site row, named by majority vote of
the `site_name` column when present. Samples that fall within range of
an *existing* site reuse it.

### People assignment

Optional bulk-people picker on the import page applies a set of
(personnel, role) attributions to every imported sample. Useful for "I
just imported 200 samples, mark them all as collected by Alice +
Bob".

## NA / null sentinels recognized on import

Blank, `.`, `na`, `n/a`, `null`, `none`, `nan`, `not collected`,
`not applicable`, `missing`, `not provided` all parse as NULL
(case-insensitive). MIxS-mandatory slots get the `not collected`
sentinel back at export time per MIxS convention.
