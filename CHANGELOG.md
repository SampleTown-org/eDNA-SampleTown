# Changelog

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
