# Lab bench

What happens after the samples are in the freezer. Each step in this
section corresponds to a navbar tab.

## Extracts

`/extracts` — DNA / RNA / total nucleic acid / cDNA pulled from a sample.
Multiple extracts per sample are fine.

Records the kit (`nucl_acid_ext_kit` — picked from your lab's
picklist), the extraction date, the protocol URL/DOI (`nucl_acid_ext`),
QC measurements (`concentration_ng_ul`, `total_volume_ul`, A260/280,
A260/230), storage location, and free-text notes.

People attribution: who did the extraction.

## PCR

`/pcr` — organized as **plates** (typically 96-well, but
8-strip and 384-well are supported). A plate has shared conditions; each
well is an amplification recording its source extract + per-well QC.

### New PCR plate

`/pcr/new` walks you through:

1. Pick the primer set (loaded from your lab's `primer_sets` table)
2. Pick or define the PCR protocol (annealing temp, cycles, polymerase,
   `pcr_cond` string per MIxS)
3. Add reactions — each reaction picks a source extract from the cart
   (or by typing/scanning) and gets dropped into a well via the visual
   plate layout component
4. Save — the whole plate commits in one transaction; per-reaction
   names follow the `pcr_name` naming template (default
   `{Extract}_{Gene}`)

### One-off PCR

`/pcr/new` without picking a plate just creates a single
`pcr_amplifications` row with no `plate_id`.

### Well labels

Wells are 0-padded for sortability: `A01` through `H12` on a 96-well
plate. The picker shows the visual layout; the stored value is the
0-padded string.

## Library prep

`/libraries` — same plate model as PCR. A library prep takes either a
PCR product or a direct extract (shotgun) and records the prep kit,
indexes (i7/i5 or barcode), platform target (`ILLUMINA`,
`OXFORD_NANOPORE`, `PACBIO`, `ION_TORRENT`, or `other`), fragment size,
and final concentration.

Library plates can optionally point at a parent PCR plate
(`pcr_plate_id`) for layout-preservation workflows.

## Sequencing runs

`/runs` — a run pairs an instrument + flow cell + many libraries. The
`run_libraries` junction table records which libraries went on the run
plus their FASTQ paths and read counts.

Required: run_name, platform. Optional: instrument model, flow cell
ID, run directory, FASTQ directory, total reads / bases.

## Analyses

`/analysis` — track downstream pipeline runs against a sequencing run.
SampleTown doesn't run the pipeline; it tracks *what* you ran and
where the results landed.

Fields: pipeline name + version + profile, Nextflow run name + session
ID, status (`pending` / `running` / `completed` / `failed` /
`cancelled`), input + output directories, reference DB, extra params
JSON, results summary JSON, report URL.

This tab is hidden from the navbar by default — surface it via direct
URL when ready.

## People attribution everywhere

Every entity above can have any number of attributed personnel each
with a free-text role label. The role vocabulary is suggested via the
`person_role` picklist but not enforced.

The **PeoplePicker** chip-list lives at the bottom of every entity
form; the **PeopleRoster** chip-list is on every detail page.

The project detail page rolls up *all* attributed people across the
project's downstream entities into a single People roster sorted by
contribution count, so a PI can see at a glance who worked on what.
