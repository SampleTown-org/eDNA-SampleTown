# SampleTown ↔ MIxS column audit

**Comparison**: every scientific column in `schema.sql` vs. MIxS v6.3
slot names (from `src/lib/mixs/generated/v6.3.0/slots.json`,
786 slots).

Legend:
- ✓ **direct** — SampleTown column name equals the MIxS slot name.
- ≈ **derived** — SampleTown stores the same concept under a different
  name; export translates to MIxS.
- ★ **local** — no MIxS slot; SampleTown-specific concept (lab
  attribution, lab bookkeeping, or physical media).
- ✗ **drift** — SampleTown column name looks like MIxS but differs by a
  suffix or spelling. Should be renamed for alignment.

## samples

Very MIxS-aligned: every environmental / sampling / storage slot
matches. The only local column is `collector_name`, which is kept for
backwards compat — primary attribution lives in `entity_personnel`.

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| samp_name, collection_date, env_medium, depth, elev, host_taxid, specific_host, temp, salinity, ph, diss_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate, samp_collect_device, samp_collect_method, samp_mat_process, samp_size, size_frac, source_mat_id, samp_store_sol, samp_store_temp, samp_store_dur, samp_store_loc, store_cond, ref_biomaterial, isol_growth_condt, tax_ident, filter_type | ✓ direct | |
| collector_name | ★ local | Superseded by `entity_personnel` — consider dropping from new schemas (prod still writes to it). |

## sites

Inherited into the samples row at export time.

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| lat_lon, geo_loc_name, env_broad_scale, env_local_scale | ✓ direct | |
| latitude, longitude | ★ local | Derived UI-only; `lat_lon` is the MIxS canonical string. |
| site_name, description, locality, access_notes | ★ local | No MIxS equivalent. |

## extracts — **drift flagged here**

This is the table the feedback called out. Several columns have
MIxS-like names but don't match canonical slots.

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| nucl_acid_ext | ✓ direct | "nucleic acid extraction" — protocol URL/DOI. |
| samp_taxon_id, samp_vol_we_dna_ext, pool_dna_extracts | ✓ direct | |
| **extraction_method** | ✗ drift | **Redundant with `extraction_kit`.** Not a MIxS slot. Consider dropping. |
| **extraction_kit** | ✗ drift | Maps 1:1 to MIxS `nucl_acid_ext_kit` (title: "nucleic acid extraction kit"). **Rename → `nucl_acid_ext_kit`** or add an export mapping. |
| extract_name, extraction_date | ★ local | No MIxS equivalent. |
| concentration_ng_ul, total_volume_ul, a260_280, a260_230, quantification_method | ★ local | QC values — not in MIxS. |
| storage_location, storage_room, storage_box | ★ local | Physical lab-book tracking. |

**Recommendation:** consolidate `extraction_method` + `extraction_kit`
into one column named `nucl_acid_ext_kit`. Keep `nucl_acid_ext` for
the protocol URL. This cleans up `/extracts/new` (currently shows both
"Extraction Method / Kit" and "nucl_acid_ext" which is confusing).

## pcr_plates / pcr_amplifications

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| target_subfragment, nucl_acid_amp | ✓ direct | |
| **pcr_conditions** | ✗ drift | MIxS slot is **`pcr_cond`**. **Rename.** |
| forward_primer_name / _seq / reverse_primer_name / _seq | ≈ derived | MIxS has single `pcr_primers` (free text, usually `FWD=SEQ;REV=SEQ`). SampleTown splits for UX; export should concatenate. |
| target_gene | ≈ derived | Lives on `primer_sets.target_gene`; joined into samples/extracts row at export. ✓ |
| annealing_temp_c, num_cycles, polymerase | ★ local | Not in MIxS (MIxS only carries `pcr_cond` as a free-text blob). |
| band_observed, concentration_ng_ul | ★ local | QC, lab-book. |
| plate_name, pcr_date, pcr_name, well_label | ★ local | Lab-book. |

**Recommendation:** rename `pcr_conditions` → `pcr_cond` (single
canonical MIxS slot). Add an export-time composer that combines the
four primer columns + `pcr_cond` into the single MIxS `pcr_primers`
field.

Also missing from schema: `mid` (multiplex identifiers), `adapters`,
`neg_cont_type`, `pos_cont_type`. These are optional MIxS slots — add
if the lab uses them.

## library_plates / library_preps — **large MIxS gap**

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| library_prep_kit | ✓ direct | |
| library_source, library_selection, library_type (= SRA library_strategy) | ★ SRA (not MIxS) | These live in the SRA controlled vocabulary, not MIxS proper. Kept as local SRA fields; SRA export uses them directly. |
| platform, instrument_model | ★ SRA | Ditto. |
| index_sequence_i7, index_sequence_i5, barcode | ★ local | `barcode` isn't a MIxS slot (despite the name); it's a lab-book field. |
| fragment_size_bp, final_concentration_ng_ul | ★ local | MIxS has `lib_size` (INTEGER) for library size — **could alias**. |
| **missing** `lib_layout` | — | MIxS enum (paired vs. single); SampleTown derives this from whether `fastq_r1` + `fastq_r2` are both set on `run_libraries`. Export can synthesize. |
| **missing** `lib_vector`, `lib_screen`, `lib_reads_seqd` | — | Rarely used for amplicon/eDNA; add only if needed. |

**Recommendation:** add export-time derivation of `lib_layout`
(paired/single) and `lib_reads_seqd` (from `run_libraries.read_count`).
Consider aliasing `fragment_size_bp` → `lib_size` at export.

## sequencing_runs — **missing seq_meth**

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| platform, instrument_model | ★ SRA | MIxS has a single `seq_meth` slot; SampleTown stores these separately for SRA submission. Concatenate at MIxS export. |
| run_name, run_date, flow_cell_id, run_directory, fastq_directory, total_reads, total_bases | ★ local | Lab-book / processing. |

**Recommendation:** add an export composer that emits
`seq_meth = "<platform> <instrument_model>"` (or
`"Illumina MiSeq"`, `"Oxford Nanopore MinION"` etc.) when exporting MIxS.

## projects

| SampleTown column | Status | MIxS slot / notes |
|---|---|---|
| project_name | ✓ direct | |
| description, pi_name, institution, github_repo | ★ local | Not in MIxS. |
| **missing** `experimental_factor`, `investigation_type`, `sop`, `associated_resource` | — | MIxS project-level slots exist but SampleTown has no place to enter them. Consider adding as a custom_fields JSON spill or as explicit columns. |

## Summary table of recommended renames

| Current | Target | Why | Risk |
|---|---|---|---|
| `extracts.extraction_method` | drop (merge into kit) | redundant with `extraction_kit`; not a MIxS slot | need to migrate existing values into `extraction_kit` |
| `extracts.extraction_kit` | `extracts.nucl_acid_ext_kit` | exact MIxS alignment | additive: rename column, preserve data |
| `pcr_plates.pcr_conditions` | `pcr_plates.pcr_cond` | exact MIxS alignment | additive column rename |
| `pcr_amplifications.pcr_conditions` | `pcr_amplifications.pcr_cond` | ditto | ditto |

All three are mechanical column renames: `ALTER TABLE … RENAME COLUMN
old TO new` in the migration runner + schema.sql update + a sweep of
`.prepare(...)` references. No data loss.

## Non-action items

- **Primer columns** (forward/reverse name + seq): keep split for UX,
  compose into `pcr_primers` at export.
- **target_gene** on `primer_sets`: keep denormalized via FK join.
- **samples.collector_name**: leave in place (backwards compat); new
  code should use `entity_personnel`.
- **SRA-only columns** (library_source/selection, platform,
  instrument_model): these are SRA controlled vocab, not MIxS. Not a
  drift, just a different namespace.
