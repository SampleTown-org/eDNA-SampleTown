# GitHub backup & restore

Per-lab snapshot pipeline pushing JSON of every lab-scoped table to a
configured GitHub repo. Restore replays a chosen commit's snapshot
back into the lab.

## What gets snapshotted

`TABLES_TO_EXPORT` in `src/lib/server/github.ts`, in dependency-safe
INSERT order:

1. **Reference + config** — `constrained_values`, `primer_sets`,
   `pcr_protocols`, `personnel`
2. **Top-level entities** — `projects`, `sites`, `samples`,
   `sample_values`, `site_photos`, `sample_photos`, `extracts`,
   `pcr_plates`, `pcr_amplifications`, `library_plates`,
   `library_preps`, `sequencing_runs`, `analyses`
3. **Junction tables** — `run_libraries`, `entity_personnel`

Skipped: `feedback` (live admin queue), `invites` (transient + secrets),
`saved_carts` + `saved_cart_items` (private to each user),
`db_snapshots` (this lab's own backup history — circular), `sessions`,
`oauth_states`, `sync_log`, `users`, `labs`.

Also NOT in the snapshot: **photo binaries** themselves. The
`*_photos` rows are metadata (filename, mime, original_filename) only.
Restore brings the rows back but the JPEGs stay on the original
server's `data/{site_photos,sample_photos}/` directory.

## Per-lab config

Each lab has its own `github_repo` (owner/name) + `github_token`
(PAT) in the `labs` table, configured via Manage → Backup. When unset,
fall back to the legacy global `GITHUB_REPO` / `GITHUB_TOKEN` env vars
for backward compat with single-lab installs.

`github_token` is stored plaintext in SQLite. Same risk profile as
`.env` on disk — encrypt at rest is a future hardening item if a use
case lands.

## Snapshot path layout

`data/<lab-slug>/<table>.json` per lab. Multiple labs can share one
GitHub repo without overwriting each other.

## Push pipeline

`commitSnapshot(labId, message, options?)` in `src/lib/server/github.ts`:

1. **Resolve config** — per-lab values, fall back to env, return null
   if neither has a token + repo
2. **Export** — `exportTablesAsJson(labId)` walks every
   `TABLES_TO_EXPORT` table with the lab's filter (`WHERE lab_id = ?`
   for direct refs, JOIN-via-parent for `sample_values`,
   `site_photos`, `sample_photos`, `run_libraries`,
   `entity_personnel`)
3. **Get base** — `GET /repos/{owner}/{repo}/git/ref/heads/main` →
   `commit/{sha}` → `tree/{sha}`
4. **Create blobs** — one `POST blobs` per table, content =
   `JSON.stringify(rows, null, 2)`
5. **Create tree** — `POST trees` with `base_tree` = the parent's
   tree SHA + the new blob refs at `data/<lab-slug>/<table>.json`
6. **Skip-if-unchanged** — if the new tree's SHA equals
   `baseTreeSha`, no blob differs. Don't make the commit (keeps the
   GitHub commit list clean) and don't insert into `db_snapshots`
   (keeps the in-app history clean too). Bump `last_backup_at` so
   the scheduler doesn't retry every tick. Return `{ sha:
   latestSha, unchanged: true }`
7. **Otherwise** — `POST commits` + `PATCH refs/heads/main` →
   record the new commit, bump `last_backup_at`, return
   `{ sha: newSha }`

Errors are caught and persisted to `db_snapshots` with `status =
'failed'` and the (truncated) error message, so admins can debug
auth/repo problems from the UI without chasing pm2 logs.

## Scheduler

`startBackupScheduler()` installs a 15-minute `setInterval` on first
`getDb()` call. Per tick:

```sql
SELECT id, name, last_backup_at, backup_interval_hours
FROM labs
WHERE backup_interval_hours IS NOT NULL AND backup_interval_hours > 0
  AND (
    last_backup_at IS NULL
    OR (julianday('now') - julianday(last_backup_at)) * 24 >= backup_interval_hours
  )
```

For each due lab, runs `commitSnapshot` with `automatic: true`.
Sequential to avoid GitHub secondary rate-limiting when many labs are
due at the same tick. Conservative: a 24-hour lab fires
approximately at 24h ± 15min.

## Restore pipeline

`restoreSnapshot(labId, commitSha)`:

1. **Resolve config** — same as push
2. **Fetch each table's JSON** at the chosen commit via
   `GET /repos/{owner}/{repo}/contents/data/<lab-slug>/<table>.json?ref=<sha>`
   with `Accept: application/vnd.github.raw+json`
3. **404 → tolerated** — older snapshots that pre-date a
   `TABLES_TO_EXPORT` addition just have empty data for those
   tables; recorded in the `missing` array
4. **Replay** — single transaction with `defer_foreign_keys = ON`:
   - Wipe in reverse-dependency order
   - INSERT in declared order, building each table's column list as
     `intersection(table_info, snapshot_keys)` so older snapshots
     missing newer columns just use the column default
   - Force `lab_id` on every restored row to the restoring lab's id
     (in case a snapshot is replayed into a different lab — e.g.
     forking from another lab's repo)
5. **Returns** `{ ok, counts: {table: n}, missing: [tables] }` or
   `{ ok: false, error, hint? }`

The deferred-FK trick is the same one used by `DELETE /api/lab` —
several intra-lab FKs use RESTRICT or NO ACTION (samples.site_id,
library_plates.pcr_plate_id, primer_set_id refs). Without deferring,
mid-transaction the engine sees temporarily inconsistent rows and
rejects. With `defer_foreign_keys=ON`, FKs are checked at COMMIT, by
which point the wipe + reload is consistent.

## Restore caveats

- **Missing tables** in older snapshots get reported in the result
  `missing` array but are NOT a failure. The lab's existing rows for
  those tables get wiped and not replaced.
- **`created_by` user IDs** in restored rows are passed through
  as-is. If a referenced user no longer exists, the FK check at COMMIT
  fails — admin needs to either keep those users around or manually
  null them in the snapshot
- **Photo binaries** on disk are NOT touched. Restoring photo metadata
  for files that don't exist on disk just gives you 404s when someone
  clicks the photo
- **No partial restores** — it's all-or-nothing. Want just one
  project back? Manually pull the JSON, edit, and INSERT yourself

## Connection test

`GET /api/lab/settings/test` does a single `GET ref/heads/main` with
the configured token + repo and translates the result into an
actionable hint per status code:

| Status | Hint |
|---|---|
| 200 | OK |
| 401 | Token is invalid or expired. Generate a new one and re-paste |
| 403 | Token does not have permission. Check repo access + Contents: Read+Write + org approval |
| 404 | Repo or main branch not found. Empty repos need at least one commit |
| 409 | Repo is empty. Initialize with at least one commit (e.g. README) |

Save Settings auto-runs this test and surfaces the result inline so
admins know immediately whether their config works, instead of waiting
through a full snapshot to discover it doesn't.
