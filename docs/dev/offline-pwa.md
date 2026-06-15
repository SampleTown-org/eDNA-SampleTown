# Offline field-capture PWA

Status: **Tier 1+2 MVP implemented on branch `feat/offline-pwa`** (2026-06-11),
pending on-device verification + review. This document is the design of record
for the offline, mobile-first sample-submission wizard. The schema has reserved
sync columns since the multi-lab work (`client_id`, `local_created_at`,
`sync_version`, `sync_log`); this is the plan that finally uses them.

Implemented: the wizard route `/samples/quick` (#4), the inline site
sub-wizard with GPS (#5), date+time / weather-conditions / photo-caption field
additions (#6/#7/#8), the `src/service-worker.ts` app-shell cache (#2), and the
`src/lib/offline/outbox.ts` IndexedDB queue + on-reconnect flush (#3). The
offline runtime path still needs manual on-device testing — typecheck/build
can't exercise it. Offline-site linkage uses the client-id-as-PK trick (below),
so the `sites.client_id` migration question is moot for the MVP.

Tracking: see the "Offline field-capture PWA" epic on
`SampleTown-org/eDNA-SampleTown`.

## Goal

A phone-first **Progressive Web App** that lets a field operator capture eDNA
samples one question at a time, **fully offline at sea**, and **syncs when back
on network**. It is the mobile counterpart to the desktop batch grid
(`/samples/batch`); both write the same samples through `POST /api/samples`.

MVP scope (decided 2026-06-11): **Tier 1 + Tier 2** of the field-notebook diff
(see below). Tier 3 (structured presence-flag observations, `samp_capt_status`,
video) is deferred.

## Why a wizard (vs. the batch grid)

The batch grid is a transposed spreadsheet — excellent on a laptop, hostile on a
phone in a Zodiac. The wizard trades width for depth: **one input per page**,
big touch targets, device GPS, works one-handed.

## The wizard state machine

Questions are built from the active MIxS combination class exactly like
`organizeForm()` already does (`src/lib/mixs/sample-form.ts`) — no new field
registry. Order: identity → MIxS-required → MIxS-recommended → Tier 1/2
additions. Each question is `{ key, label, widget, validate(), required,
section }`.

State: `mainQueue[]`, `skipped[]` (FIFO), `answers{}`, `cursor`.

Per-page action button (the core interaction):

- The button reads **`Skip`** while the field is empty or invalid, and flips to
  **`Next`** the instant the value is non-empty **and** passes validation
  (a `$derived` validity check reusing the slot's MIxS type/pattern).
- `Skip` → push key onto `skipped[]`, advance.
- `Next` → commit value, advance.
- **`Complete`** is *always* present.
- Header: progress `Q 4 / 23 · 2 skipped`, plus Back.

**Skipped questions loop back:** after `mainQueue` drains, `skipped[]` is
re-presented as a second pass. On the second pass, `Skip` means *leave blank /
N\A* and advances **without re-queuing** — this terminates the loop. Anything
still blank that is **MIxS-required** is flagged (not silently dropped).

**`Complete` at any time:** validate required-only. If a required question is
unanswered, jump to the first one and show the remaining count; otherwise go to
a **review screen** (all answers, blanks/skips highlighted, tap to edit) →
finalize.

**Sticky carry-forward:** project / site / date+time / weather / people /
`env_medium` are marked *carry forward* so a burst of samples at one spot only
re-asks per-sample deltas (`samp_name`, `depth`, replicate). This is the
wizard-shaped version of the grid's `fillRight` / `applyFirstToEmpty`.

## Site selector + inline site-creation sub-wizard

GPS lives on the **site**, not the sample (the `sites` table already carries
`lat_lon`, `latitude`, `longitude`, `geo_loc_name`, `locality`,
`env_broad_scale`, `env_local_scale`); a sample inherits its site's
coordinates. So the wizard's first step is a **site selector**. If the needed
site doesn't exist, the operator creates it inline **using the same
one-question-per-page procedure**, then returns to sample capture with that site
selected.

Site sub-wizard questions: project (context) → `site_name` (the only
NOT NULL field) → **GPS** (`navigator.geolocation` → `latitude` / `longitude` /
accuracy / altitude, a Leaflet pin to confirm/adjust, manual fallback) →
`geo_loc_name` → `locality` → `env_broad_scale` → `env_local_scale` →
`description` / `access_notes`.

**Offline-site caveat:** `sites` has `sync_version` but **not**
`client_id` / `local_created_at`. Offline-created sites need a client id so the
sample that references them can be linked before the server assigns a real id.
Options (decide at build time): (a) add `client_id` + `local_created_at` to
`sites` via an idempotent `migrate-*.mjs` — see [the deploy-migration
rule](#); or (b) stash a client id in the existing `custom_fields` JSON and
resolve it server-side on sync. Samples already have the columns.

## Offline + sync mechanics

- **Service worker** via `vite-plugin-pwa` (Workbox). Precache the app shell +
  the MIxS glossary JSON + the lab's picklists + its projects/sites, so the
  wizard renders fully offline. (Today `static/manifest.json` exists and is
  linked in `app.html`, but **no service worker is registered** — that is
  step 0.)
- Each completed sample → an **IndexedDB outbox** row with
  `client_id = crypto.randomUUID()` and `local_created_at`. Photos stage as
  Blobs.
- On reconnect (**Background Sync**, with an on-load flush fallback), POST queued
  sites first, then samples (`POST /api/samples`), then photos. Dedup is keyed
  on `client_id` so a retried POST is idempotent — exactly what the reserved
  `client_id` / `sync_version` columns were for.

## Field-notebook diff (LakePulse 2017–2019, Appendix L)

Diffed against the LakePulse electronic forms (field manual pp. 213–end). Our
app is MIxS-driven and environment-agnostic; LakePulse is lake-limnology
specific. Verdicts:

| LakePulse field | SampleTown today | Verdict |
|---|---|---|
| Date **+ time** | `collection_date` (date only) | **Partial** — add time |
| GPS per collection (lat/lon/alt/accuracy, map, auto-locate) | inherited from site | **Missing** → site sub-wizard GPS |
| Depth / sampling depth | `depth` | Have |
| Air temp, wind speed/dir, atmospheric pressure, humidity | not surfaced | **Missing** (slots: `air_temp`, `wind_speed`, `wind_direction`, `barometric_press`, `humidity`) |
| Precipitation / water state / sky octa 0–9 | none | **Missing** (no MIxS slot → `misc_param`) |
| Secchi transparency | `turbidity` (proxy) | **Partial** (→ `misc_param:secchi_depth_m`) |
| Photo **+ caption**; video | photos, no caption, no video | **Partial** |
| Presence flags (odor/scum/floating/wildlife/livestock/recreation/shoreline %) | free `notes` only | **Missing** → Tier 3 |
| "Was X sampled / not collected" | implicit | **Missing** (slot: `samp_capt_status`) → Tier 3 |
| Replicate A/B/C | separate sample rows | Have |
| Sample volume/size | `samp_size` | Have |
| Fixative added | `samp_store_sol` | Covered |
| People + role | PeoplePicker | Have |
| Macrophytes; RBR/fluoroprobe/ASD logs; dissolved-gas vials; sediment cores; petrifilm incubation; lab analyte matrix | — | **Out of scope** (instrument/lab/lake-specific) |

All confirmed against MIxS v6.3.0: `lat_lon`, `air_temp`, `wind_speed`,
`wind_direction`, `barometric_press`, `humidity`, `light_intensity`,
`water_current`, `tidal_stage`, `samp_capt_status` are real slots. Any slot not
on the `samples` table stores in the `sample_values` EAV — so the additions
below need **no schema migration** (the lone exception is offline-site
`client_id`, above).

## Prioritized additions

**Tier 1 — the reason to go mobile:**

1. Per-sample GPS via the **site sub-wizard** (`latitude`/`longitude`/accuracy/
   altitude + map pin). Inherited onto the sample.
2. Collection **time** — extend `collection_date` capture to date+time (MIxS
   `collection_date` already permits a full ISO timestamp; storage unchanged).

**Tier 2 — high-value field context (existing MIxS slots, no migration):**

3. Weather block (carry-forward step): `air_temp`, `wind_speed`,
   `wind_direction`, `barometric_press`, `humidity`.
4. Water/sea state + clarity: `water_current`, `tidal_stage`, and secchi as
   `misc_param:secchi_depth_m`.
5. Photo **caption** per photo (`entity_photos` field add).

**Tier 3 — deferred** (tracked as issue #9): presence-flag observation block
(`misc_param:*`), `samp_capt_status`, video.

**Out of scope:** macrophyte coverage, instrument/probe logs, dissolved-gas vial
grids, sediment-core extrusion, petrifilm incubation, full lab analyte matrix —
these belong to the lab-bench / instrument modules, not the field wizard.
