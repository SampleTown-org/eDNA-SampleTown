# Manage (admin)

The Manage tab in the navbar (visible to admins and regular users; some
sub-tabs are admin-only) is the catch-all for lab-level configuration,
people management, and ops.

## Tabs

| Tab | Who can see | Covers |
|---|---|---|
| **Naming** | all | Default naming templates per entity type (`{Project}_{Year}_…` etc.) |
| **Picklists** | all | Lab-managed vocabulary for every constrained-but-not-MIxS-mandated field |
| **Primer Sets** | all | Linked records of (gene + region + F/R primer + sequence + reference) |
| **PCR Protocols** | all | Linked records of (polymerase + annealing + cycles + conditions) |
| **People** | all | Personnel directory (used for attribution); admin-only sub-section: User Accounts + Lab Invites |
| **Labels** | all | Avery 5160 sticker sheet generator |
| **Backup** | admin | Per-lab GitHub backup config + Backup now + restore from a snapshot |
| **Feedback** | admin | The lab's feedback queue + admins-of-any-lab queue for NULL-lab anonymous feedback |
| **Danger** | admin | Delete this lab |

A "Tools" row at the top of every Manage page links out to **Import /
Export** (`/export`) and **MIxS Glossary** (`/glossary`).

## Picklists

Single table (`constrained_values`) with `(category, value, label,
sort_order, is_active)` rows scoped per-lab. Categories are grouped in
the UI by vocabulary authority:

- **MIxS** — geo, env_broad_scale, env_local_scale, env_medium,
  collection devices, storage solutions/temps/locs, etc.
- **SRA / ENA** — `library_strategy`, `library_source`,
  `library_selection`, `seq_platform`, `seq_instrument` — these are
  validated against the cached NCBI vocabulary (small green/yellow chip
  tells you whether each entry is on NCBI's controlled list)
- **SampleTown** — `pipeline`, `filter_type`, `storage_room`,
  `storage_box`, `extraction_method`, `library_prep_kit`, `barcode`,
  `person_role`

Add / edit / deactivate entries inline. Drag to reorder.

## Primer sets

A single primer set bundles target gene + sub-region + F/R primer name
+ sequence + reference. Pick the bundle on a PCR plate and it
populates the four primer fields atomically. Default seeds include
common eDNA markers (16S V4 515F/806R, 18S V4, CO1 mlCOIintF/jgHCO2198,
12S MiFish, ITS1, ITS2).

## PCR protocols

Bundles polymerase + annealing temp + cycles + the `pcr_cond` MIxS
string. Pick on a plate to populate atomically. Default seeds include
"standard 16S 55°C/30", "CO1 touchdown 62→46°C/35", etc.

## People

Two sections (admin only sees both):

- **User Accounts** — sign-in identities. Approve pending GitHub
  signups (legacy auto-approve flow, still surfaced for backfill),
  reset local-account passwords, change roles, soft-delete users.
- **Lab Invites** — generate / copy / revoke invite tokens. See
  [Getting started](../getting-started.md) for what the join flow
  looks like from the recipient's side.
- **Personnel Directory** — the wet-lab people roster used for "who
  did the work" attribution on samples / extracts / PCRs. Optionally
  linked to a User Account row (so a User and a Personnel record can
  be the same human or not).

## Backup

The whole [GitHub backup & restore](../dev/backup.md) story lives
here, but at a glance:

1. **Configure** — lab admin pastes a GitHub repo (`owner/name`) and a
   PAT with `Contents: Read and write` on that repo. Optional auto-
   backup interval in hours (24 = daily, 168 = weekly).
2. **Save settings** — runs an immediate connection test against the
   configured repo (GET ref/heads/main) and reports the result inline
   with status-specific hints.
3. **Backup now** — pushes a fresh JSON snapshot. Skips silently if
   nothing changed since the last snapshot (no commit, no history row).
4. **Restore from backup** — picks a previous commit from the dropdown
   (last 30 commits that touched this lab's path), confirms by typing
   the lab name, wipes lab data, replays the chosen snapshot.

## Danger zone

Single button: **Delete this lab**. Cascades through every lab-scoped
table; remaining members keep their accounts but become lab-less and
get bounced to `/auth/setup-lab` on their next request. Confirm by
typing the lab name exactly.

The corresponding self-delete-account button lives on `/account` (the
user's own account page), not in Manage.
