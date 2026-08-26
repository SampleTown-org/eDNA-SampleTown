# Changelog

## Unreleased

### Import from SRA / ENA / GenBank
- New `/api/import/insdc`: fetch sample metadata by accession (BioProject,
  study, BioSample, experiment, run, or GenBank/EMBL sequence) and get back a
  TSV in SampleTown's import columns. Nothing is inserted there — the TSV goes
  to `/api/import/mixs`, so archive imports share the existing dry-run preview,
  column mapper, MIxS validation, site clustering, and insert path.
- `/export` → Import gains a **From accession** source alongside file upload.
- Retrieval is the ENA Portal API (which mirrors all three archives) with NCBI
  eutils as a BioSample fallback for records not yet mirrored. New dependency:
  `fast-xml-parser`, for the NCBI BioSample XML.
- INSDC maps onto the entity chain: BioProject → project, BioSample → sample
  (+ site), Experiment → extract / PCR / library, Run → sequencing run.
- The submitter's declared checklist is honoured, so MIMARKS records validate
  as MIMARKS: NCBI `ncbi_reporting_standard` supplies checklist + extension,
  ENA's GSC `ERC…` checklists supply the environmental package. Ambiguous ones
  (`ERC000056`, `ERC000058`) are left to the form default rather than guessed.
- Archive columns with no explicit mapping are matched against the importer's
  full MIxS vocabulary; whatever it doesn't recognize is kept as a
  `misc_param:` tag, so source accessions stay queryable on the sample.
- Run rows that come back from ENA without a collection date or coordinates are
  filled in from their NCBI BioSample. ENA indexes a submission's runs before it
  ingests the BioSamples they point at, and the gap can outlast the daily
  mirror — `PRJNA1444909` fetched 81 runs carrying no sample metadata at all.
  ENA's values always win; NCBI only fills blanks, and INSDC null placeholders
  are skipped so an absent field is not dressed up as a recorded one. The pass
  is bounded by wall clock rather than a sample count — batching 100 at a time,
  a 2,000-sample project adds about 15 s — because capping by count silently
  dropped metadata that was cheap to fetch. Optional `NCBI_API_KEY` /
  `NCBI_EMAIL` raise the request rate for large projects.

### Export column vocabulary
- The MIxS TSV export carries a second header row naming each column's
  vocabulary — `sampletown`, `insdc`, or `mixs` — and groups the columns by it,
  alphabetically within each group, with `samp_name` first. An exported sheet
  mixes three vocabularies and they are not distinguishable by name alone.
  The importer strips the row when it is present, and still accepts a sheet
  without one.
- The export also carries `accession` and `project_accession`, so a sheet says
  where its records came from and re-importing puts them back.

### Fixed: archive fields landing in the wrong column
- A raw archive column whose MIxS slot was already spoken for was demoted to a
  `misc_param:` tag even when the slot was empty on that row. ENA exposes
  `temperature` and the GSC checklists a bare `temp`, both meaning the MIxS
  `temp` slot, so PRJNA421293 had 2681 temperatures in the slot and 144
  stranded in `misc_param:temp`. Same-concept columns now fill the slot.

### Fixed: BioSamples merged on import
- `samp_name` now identifies exactly one BioSample. Naming samples from
  `sample_title` collapsed distinct BioSamples together, because NCBI writes a
  title for submitters who left it blank and it is not unique: "MIMARKS Survey
  related sample from marine metagenome" covers 472 BioSamples in PRJNA421293
  alone. The importer keys samples on (project, samp_name), so those folded into
  one another silently, taking their runs and extracts with them — PRJNA421293
  produced 1404 samples for 2026 BioSamples and left 123 sites holding nothing.
  Where a title spans more than one accession the sample is named by its
  accession instead, and the title is kept as `misc_param:sample_title`.
  **Re-import any project imported between this release and the previous one.**

### Tables
- A second horizontal scrollbar sits above the header. These tables are wider
  than the viewport by design — MIxS gives every sample dozens of optional
  parameters — and a scrollbar only at the bottom of a long table is off-screen
  exactly when the reader is looking at the top rows.
- The right edge fades while there are more columns to reach, with a "more →"
  marker level with the header. Without it the table looks like it simply ends.
- The proxy scrollbar is drawn at a size worth aiming at and never fades or
  resizes under the pointer; overlay scrollbars otherwise hide until scrolled
  and some grow on hover, moving the target while it is being aimed at.
- The first column wraps instead of sizing to its content. It is sticky, so one
  long sample name pushed every other column off-screen and pinned it there.

### Sites and samples views
- `/sites` colours pins by project and gains a project filter above the map.
- `/samples` gains the same project filter, and choosing a `+ parameter` now
  focuses the whole view on it: the table and map narrow to the samples
  carrying it, its column appears, and the pins colour by its value. Adding a
  column on its own mostly rendered blanks, since a parameter is only populated
  on some samples.

### Sensitive locations
- "Sensitive location" moved from samples to sites. Sensitivity is a property
  of the place, not of one sample taken there, so every sample at the site
  inherits it. `samples.is_location_sensitive` is retained as legacy and unread;
  no lab had set it.
- Fixed: coordinate coarsening never happened. The mask needs the site's raw
  latitude and longitude, and the export query selected neither, so a record
  flagged sensitive still exported its precise position.

### Accessions
- Records imported from an archive carry the accession they came from, on a new
  nullable `accession` column on projects, samples, extracts, PCR reactions,
  library preps, and sequencing runs. Applied to existing databases by an
  additive migration at startup, since `schema.sql` runs as CREATE TABLE IF NOT
  EXISTS and never reaches a table that already exists.
- Every list view shows it: the `ID` column becomes `Accession` when any row
  has one, falling back to the internal id for records entered by hand. Detail
  pages link the accession to its ENA browser page.

### SRA import
- `sample_title` names the sample, ahead of `sample_alias` — the alias is the
  submission-system handle and is often a sequencer well like "S230_2".
- PCR reactions and library preps are named by their SRA experiment accession.
  An experiment is one library prep sequenced in one or more runs, so runs
  sharing an experiment now resolve to a single library instead of one apiece.
- Reactions and preps are laid out on plates named for the submission they
  arrived in (`<submission_accession>_pcr` / `_lib`). Plate creation is new to
  the import pathway generally: `pcr_plate_name` and `library_plate_name`
  columns create or reuse a lab-scoped plate by name, so spreadsheet imports
  can place work on plates too.

### Fixes
- Deleting a project works again. `library_preps` forgets a deleted source via
  ON DELETE SET NULL, but a row left with no pcr, extract, or plate violates its
  own CHECK, which aborted the whole statement — so any project holding
  libraries returned 400. The subtree is now removed explicitly, bottom-up,
  rather than relying on an ON DELETE cascade order SQLite does not promise
  (`samples.site_id` is ON DELETE RESTRICT, so sites cannot go before their
  samples). Plates and sequencing runs are lab-scoped and survive; runs left
  holding nothing once the project's libraries are gone are cleared out, since
  an archive import creates one per submitted run.
- Plates emptied by a project delete are removed too, on the same rule as
  sequencing runs: a plate still holding another project's wells is kept, and
  so is one that was already empty before the delete. Deleting a PCR plate that
  a library plate cites (`library_plates.pcr_plate_id`, which has no ON DELETE
  action) would abort the transaction, so such a plate goes only when the
  library plate citing it goes too.
- The delete response reports what was actually removed rather than what was
  predicted. Extracts and reactions still come from the pre-count, since SQLite
  reports no row count for cascaded deletes.
- The delete confirmation itemises what goes — sites, samples, DNA extracts,
  PCR reactions, library preps, sequencing runs, and plates — instead of
  quoting a sample count alone. New `GET /api/projects/[id]/delete-preview` supplies the
  numbers, counted from the same SQL the delete runs, so the two cannot drift.
- The delete confirmation said sequencing runs are kept. They are kept only
  while they still hold another project's libraries; a run left holding nothing
  is removed, which for an archive-imported project is most of them.
- The projects list dropped a project from the screen whether or not the server
  actually deleted it, which is why the failure looked silent. It now reports
  the error and keeps the row, and a bulk delete removes only what succeeded.

### From the feedback queue
- 8-well strips fill A01–H01 instead of A01–A08 — a strip is one column of a
  plate, which is the orientation it sits in and the order a multichannel
  pipette loads it. Strips laid out before this read as 96-well plates with row
  A filled; every well still renders in the right place, in a plate grid rather
  than a strip.
- `YYYYMMDD` dates are accepted on import and converted to ISO-8601, for
  `collection_date`, `extraction_date`, `library_prep_date`, `run_date` and
  `pcr_date`. Slash-separated dates are deliberately left alone: day-first and
  month-first are indistinguishable, and guessing would move samples in time.
- Samples with no coordinates now import by default (see
  `allowSitesWithoutCoords` below). Collection date and coordinates remain
  required when adding samples through the form.
- A site's detail map shows a marker at the site. `MapPicker` drew the pin only
  when interactive, so a read-only map centred on the location without marking
  it.

### Import UI
- Import gains a **Templates** tab beside *Upload file* and *From accession*,
  holding the MIxS template downloads.
- **Export TSV** beside *Validate* and *Import*: the preview is read-only, so
  correcting a value means editing the sheet and importing it again — and rows
  fetched from an accession had no file on disk to edit.
- Warning lists scroll instead of growing without bound. A large project can
  contribute a line per row, which pushed the import button off the page.
- `allowSitesWithoutCoords` imports samples that have no coordinates by putting
  them on a site named for whatever locality the sheet carries, falling back to
  one "Location not recorded" site per project. On by default — callers opt out
  by sending it explicitly false. The dry run says how many rows are skipped
  when it is off.
- The archive fetch no longer warns about records it reconciled against NCBI or
  about missing coordinates; the source column already reports the former and
  the latter no longer costs the row its import.

### Permits
- Permit coverage no longer warns about export. Nothing in the export path
  depends on a permit — identifiers are carried into the MIxS attribution field
  when present — so the amber "will not be covered on export" notices on the
  project and site pages are now neutral "no permits linked" text.

### Import pipeline
- PCR reactions are now created on import. New `pcr_*` columns
  (`pcr_name`, `pcr_date`, `pcr_cond`, `nucl_acid_amp`, `target_gene`,
  `target_subfragment`, primer names/sequences, `annealing_temp_c`,
  `num_cycles`, `pcr_notes`) create a `pcr_amplifications` row off the sample's
  extract, and the row's library links to it as its source. A sheet with PCR
  columns but no extract columns gets the extract that implies, since
  `pcr_amplifications.extract_id` is NOT NULL.
- Extracts accept `nucl_acid_ext`; libraries accept `library_source`,
  `library_selection`, `library_type`, and `library_fragment_size_bp` — all
  real columns that previously spilled into `sample_values` or were dropped.
- Fixed: repeated imports duplicated library rows. Libraries now dedupe by
  (extract, name) like samples, extracts, PCRs, and runs already did, and
  `run_libraries` links refresh instead of colliding on their primary key.
- Fixed: `mixs_checklist`, `extension`, and `collector_name` were offered as
  column-mapper targets but could not resolve as headers, so a sheet declaring
  its own checklist — or a SampleTown export round-tripped back in — silently
  dropped them.
- Fixed: dry-run MIxS validation stripped every slot without a SampleTown
  column before validating, reporting supplied values as missing. Spilled slots
  are now validated; SampleTown-local columns no longer trip
  `additionalProperties`.

## v2.0.0 — 2026-04-15

Multi-tenant rewrite + self-serve onboarding + per-lab GitHub backup &
restore + a comprehensive security pass. Same single-binary deploy story;
no breaking config changes for existing single-lab installs (legacy env
fallbacks preserved). Repo moved from `rec3141/SampleTown` to
`sampletown-org/edna-sampletown`, primary URL is now
`https://edna.sampletown.org` (old `sampletown.reric.org` 301-redirects).

### Multi-lab tenancy
- New `labs` table; every top-level entity (projects, sites, samples,
  extracts, pcr/library plates + amps + preps, runs, analyses, personnel,
  picklists, primer sets, pcr protocols, saved carts, feedback,
  db_snapshots, invites) carries `lab_id`. Cross-lab reads/writes return
  404 (no existence-leak).
- New `requireLab` / `requireLabAdmin` guards + `assertLabOwnsRow`
  helper enforce the boundary in every API handler and SSR loader.

### Self-serve onboarding
- GitHub OAuth signup auto-approves; lab-less users land on
  `/auth/setup-lab` to either create a new lab (becoming its admin) or
  paste an invite to join an existing one.
- Lab-invite tokens (24-byte url-safe, single-use, default 14-day TTL)
  with admin UI in Manage → People. Atomic
  `UPDATE WHERE used_at IS NULL` so two simultaneous accepts can't
  double-spend.
- Public landing copy: "Free for academic and nonprofit use; contact us
  for enterprise."
- CLI: `scripts/create-lab.mjs` bootstrap for ops-driven lab creation.

### GitHub backup + restore
- Per-lab `github_repo` + `github_token` (PAT) configured in Manage →
  Backup. Snapshot path is `data/<lab-slug>/<table>.json` so multiple
  labs can share one repo.
- Configurable auto-backup interval; scheduler ticks every 15 min.
  Skip-if-unchanged: when the new tree's SHA equals the parent commit's
  tree SHA, no commit is made (keeps the GitHub commit list clean).
- Restore from a previous snapshot: pull a chosen commit's JSON files
  back into the lab inside one `defer_foreign_keys` transaction.
- Save Settings runs an immediate connection test against the configured
  repo and reports the result inline (with status-specific hints for
  401 / 403 / 404 / 409).
- Detailed token-generation help including the org-PAT 403 fallback.

### Danger zone
- Self-delete account from `/account` (typed username confirmation,
  last-admin guard).
- Delete lab from Manage → Danger (typed lab-name confirmation, cascades
  every CASCADE-configured FK, demotes remaining members to lab-less,
  preserves the deleting admin's session for graceful redirect).

### Security hardening (2026-04-14 audit follow-through)
- xlsx swapped from abandoned npm `0.18.5` to SheetJS CDN `0.20.3`
  (CVE-2023-30533, CVE-2024-22363).
- SvelteKit + adapter-node bumped, `cookie` overridden to `^0.7.2`.
- Bcrypt timing channel fixed (dummy hash now uses BCRYPT_COST).
- Sessions wiped on password change.
- Photo responses ship `X-Content-Type-Options: nosniff`.
- Strict CSP via `kit.csp` mode hash; HSTS when ORIGIN is HTTPS;
  X-Frame-Options DENY; Referrer-Policy strict-origin-when-cross-origin
  (was same-origin, which got OSM tile servers to "Blocked"-tile us).

### Schema cleanup
- Migration layer entirely removed. `schema.sql` is the only source of
  truth; `getDb()` does `db.exec(schema)` and seeds. Schema changes are
  wipe-and-reseed.

### UI
- "Manage" replaces "Settings" in the navbar. Import/Export and Glossary
  fold into Manage's Tools row; Dashboard and Analysis dropped from the
  top nav.
- Dashboard h1 + every CRUD page h1 prefixed with the active lab's name.
- Brand mark: DNA double-helix, "SampleTown.org" wordmark.
- Calendar dots recolored ROYGBIV through the wet-lab workflow stages.
- Project detail page: Sites section above Samples; "Add Sample" gated
  on having at least one site; new `contact_email` / `funding_sources`
  fields; aggregated People roster across the project's downstream
  entities.
- Plate well labels are 0-padded (A01 not A1) for lex-sort stability.
- Cart text → cart icon in the navbar; right-side cluster reordered to
  search → qr → username → emoji → sign out.
- Self-hosted Leaflet CSS + marker images (was unpkg, blocked by CSP).

### Docs / repo
- Repo: `sampletown-org/edna-sampletown` (transferred from
  `rec3141/SampleTown`). Primary URL: `edna.sampletown.org`.
- README, DEPLOYMENT, CHANGELOG, and CLAUDE.local.md updated to match.

## v1.0.0 — 2026-04-14

First tagged release. Built for marine eDNA fieldwork end-to-end: field
collection → lab bench → sequencing → NCBI submission.

### Field workflow
- QR-based physical↔digital link: generate pre-printed Avery 5160 sticker
  sheets from `/settings` → Labels (by sets of 30, with per-label copies,
  optional entity-type pre-assignment), scan stickers through the in-nav
  camera modal, and route to either the detail page or the claim flow
  for unassigned ids
- Per-entity detail pages render their QR inline with click-to-enlarge
- Site + sample photo galleries (JPEG/PNG/WebP/GIF up to 15 MB), with
  staged upload during batch sample entry
- Mobile is read-only: browse everything, but creation/edit buttons are
  hidden to keep field entry focused on the scanner + desktop form

### Data entry
- `/samples/batch` consolidated single + bulk entry (samples-as-columns,
  fill-right shortcuts, MIxS-driven picklists, collection-date widget,
  checklist/extension pruning, staged photo upload per sample)
- `/extracts` + `/pcr` + `/libraries` harmonized: single + batch modes
  share the same options, MIxS 6.3 field surfacing on every detail page,
  nucl_acid_ext_kit / pcr_cond renamed to match MIxS slot names
- `/sites/new` accepts staged photos that upload after save
- Scanner can encode a `?t=<type>` hint on pre-typed sticker sheets so a
  scan auto-routes to the right new-form and skips the claim picker

### Cart + collaboration
- Shared cart system threads entities through the Project → Site → Sample
  → Extract → PCR → Library → Run chain. Map box-drag populates the
  cart from the sites/samples maps
- Saved carts (private + public) with an inline save form; load a cart
  to replace the current selection; owners can toggle public or delete
- Cart becomes a dismissible drawer with backdrop on mobile
- Printable QR label sheets for cart contents (Avery 5160 PDF via jsPDF)

### Dashboard + search
- Activity log across every entity type with per-user attribution,
  per-day calendar grid, and full-text search (name / type / ID / user)
- Navbar magnifier deep-links to the dashboard search
- Default sort is Modified DESC; rows show short 8-char IDs

### Data model + MIxS
- MIxS 6.3 native column names, 276 materialized combination classes,
  live completeness feedback on entry forms
- Searchable `/glossary` of all 786 slots; tooltips on every MIxS label
- Import: MIxS TSV + NCBI BioSample xlsx with automatic SRA↔MIxS
  translation, NA/N/A parsing as null, ajv validation per combination
- Export: MIxS TSV ordered + `*`-marked per the selected class template

### Auth + permissions
- GitHub OAuth (`arctic`) + local bcrypt accounts, hybrid mode
- Three roles: admin / user / viewer; viewer is read-only across the UI
- Soft-delete users preserves attribution across all created_by refs
- First admin auto-seeded as `admin/admin` with forced password change
- Cart state wipes on logout so a shared browser doesn't leak data

### Ops
- `setup.sh` for fresh-VM install, `deploy.sh` for subsequent deploys
- Idempotent ADD-COLUMN migrations for every schema change (prod-safe)
- Rate limiting: login (5/min/IP), feedback (5/min/IP), imports
  (10/h/IP, 10 MB, 10 k rows)
- Feedback form on every page captures current URL; admin triage in
  `/settings` → Feedback
