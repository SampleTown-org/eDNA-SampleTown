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
| **Labels** | all | QR label generator — Avery 5160 PDF sheets **or** direct-to-Zebra thermal printing |
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

## Labels

Two ways to put a scannable QR on a tube, box, or plate. Both encode the
same URL — `<origin>/id/<uuid>[?t=<type>]` — so a scan lands on the entity's
detail page (or, for a fresh blank code, a pre-typed new-form). See
[Scanning](scanning.md) for the read side.

**Two label sources, on every tab:**

- **Cart items** — one sticker per item in the cart, carrying its name,
  project/site context, and type tag.
- **Blank sheets** — pre-allocated UUIDs minted in the browser for future
  sampling trips; they don't exist in the DB until a scan claims them.
  Optionally pre-assign a type so scanning skips the claim picker.

**Two output paths:**

- **Download PDF** — Avery 5160 sticker sheets (US Letter, 30 per page,
  1″ × 2⅝″). Works on any laser/inkjet printer. QR is rastered client-side.
- **Print to Zebra** / **Save .zpl** — for a Zebra desktop thermal printer
  (ZD421 and friends). The QR is rendered *natively by the printer* (ZPL
  `^BQ`), so it's crisp at any size and no bitmap crosses the wire.

### Zebra thermal printer setup

The **Zebra label printer** panel at the top of the Labels tab drives direct
printing. A **Print via** switch picks where the printer lives:

- **Server printer** — the Zebra is plugged into the box running SampleTown
  (a lab/ship server, the LAN instance). Printing goes through the server, so
  *any* operator on that instance can use it with zero local software. Set up
  once by an admin (below). This is the option to use on a Linux bench —
  Zebra ships no Linux Browser Print agent.
- **This computer** — the Zebra is plugged into *your own* laptop via USB.
  Printing goes through Zebra's **Browser Print** agent (Windows/Mac), so it
  works even though the app itself is cloud-hosted — the print path stays
  local to your machine.

Either way, **Save .zpl** downloads the raw ZPL for offline testing, and the
label settings below apply to both.

#### Server printer (admin, one-time)

On the host the printer is attached to:

1. Plug in the Zebra over USB and power it on.
2. Create a CUPS print queue:
   ```
   sudo node scripts/setup-zebra.mjs
   ```
   It auto-discovers the USB Zebra and makes a raw queue named `zebra`
   (`--name` to override). Re-runnable; `--dry-run` to preview.
3. Add to the server `.env` and restart the app:
   ```
   ZEBRA_PRINTER=zebra
   ```
4. In **Manage → Labels**, set **Print via → Server printer**; the status
   turns green with the queue name and the **Print to Zebra** buttons light up.

(No CUPS? The fallback is `ZEBRA_DEVICE=/dev/usb/lp0` — a raw device path —
but the server process must then be in the `lp` group.)

#### This computer (Browser Print)

1. **Install Browser Print** on the workstation the printer is plugged into:
   <https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html>.
   Launch it; it runs in the tray/menu bar and listens on `127.0.0.1:9100`.
2. **Set the default printer** in the Browser Print app.
3. In SampleTown, set **Print via → This computer** and click **Re-check**.
   The panel should turn green with the printer's name.

#### Label settings

Tune these in the panel (saved in your browser, per bench — they apply to
both backends):

- **Width / Height** — match the media on the roll. Default 2.25″ × 1.25″.
- **Resolution** — 203 dpi for a standard ZD421, 300 dpi for the hi-res
  variant (check the part number — `…042` = 203, `…043` = 300).
- **QR error-correct** — `M` is fine for normal use; bump to `Q`/`H` for
  cryo labels that get frosted/scuffed (costs QR capacity).
- **Darkness / Speed** — thermal-transfer ribbon usually wants more darkness
  than direct-thermal. Start at 12 / 4 in/s and adjust.
- **QR size** — Auto fits the symbol to the label height; override only if it
  over/under-shoots your stock.
- **Agent URL** *(This computer only)* — leave as `http://127.0.0.1:9100` on
  Chrome/Edge. On Firefox/Safari (stricter about HTTPS→loopback), switch to
  `https://127.0.0.1:9101`.

**No ribbon / offline check:** click **Save .zpl** to download the raw ZPL.
Drop it onto the printer's USB mass-storage to print, or paste it into
<https://labelary.com/viewer.html> (set to the matching dpmm + label size) to
preview exactly what would print — no media needed.

**Troubleshooting:**

- *"Browser Print not detected"* — the agent isn't running, or the browser
  blocked the loopback request. Confirm the tray app is up, then Re-check; on
  Firefox/Safari switch the Agent URL to the `https://…:9101` form.
- *Agent running, no default printer set* — pick a default in the Browser
  Print app, then Re-check.
- *QR won't scan* — likely too small for the URL length on a tiny label;
  shorten by using a smaller label *width* of text or a larger media size,
  raise QR size, or lower the error-correction level.

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
