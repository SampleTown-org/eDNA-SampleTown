# Changelog

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
