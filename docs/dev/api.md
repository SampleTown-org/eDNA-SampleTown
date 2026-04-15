# API reference

REST endpoints under `/api/*`. Every endpoint requires a session cookie
unless explicitly marked **public**. Lab-scoped endpoints additionally
require the caller to have a non-null `lab_id`.

## Conventions

- **Lab scoping** — every list endpoint filters by the caller's
  `lab_id`; every point-lookup runs `assertLabOwnsRow` and 404s on
  cross-lab access
- **Admin gating** — admin-only endpoints return 403 for
  `role=user`/`role=viewer`. Marked **admin** below
- **Errors** — `apiError` maps SQLite constraint failures into
  user-friendly category strings; raw error text never reaches the
  client. SvelteKit `error()` HttpErrors propagate untouched
- **Response shape** — successful GETs return the row(s); successful
  POSTs return the created row or `{ ok: true }`; errors return
  `{ error: "..." }` with an HTTP status
- **CSRF** — JSON requests rely on browser CORS preflight;
  multipart/form-encoded POSTs are gated by SvelteKit's
  `csrf_check_origin`

## Auth + onboarding

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/login/local` | public | Form POST. Sets session cookie on success. Rate-limited 5/min/IP |
| POST | `/auth/logout` | any | Clears session row + cookie |
| POST | `/api/account/password` | self | Body: `{ old_password, new_password }`. Invalidates other sessions on success. Rate-limited 5/min/user |
| POST | `/api/account/avatar` | self | Body: `{ emoji }`. Empty string clears |
| DELETE | `/api/account` | self | Body: `{ confirm: <username> }`. Last-admin guard. Wipes session |
| POST | `/api/auth/setup-lab` | lab-less | Body: `{ name, slug? }`. Creates lab + makes caller admin. Rate-limited 3/day/IP |
| POST | `/api/auth/join` | any | Body: `{ token }`. Atomic single-use. Rate-limited 10/h/IP |

## Lab + invites + backup (all admin)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/lab/settings` | Lab name/slug + github_repo + token-set flag + backup interval |
| PUT | `/api/lab/settings` | Body: any subset of `github_repo` / `github_token` / `backup_interval_hours`. Empty token leaves existing alone |
| GET | `/api/lab/settings/test` | Test the configured GitHub token + repo (GET ref/heads/main). Returns `{ ok, status?, error?, hint? }` |
| DELETE | `/api/lab` | Body: `{ confirm: <lab name> }`. Cascades all lab data |
| GET | `/api/invites` | List invites for caller's lab (active + used, last 100) |
| POST | `/api/invites` | Body: `{ role, email_hint?, ttl_days? }`. Returns `{ token, role, email_hint, expires_at }` |
| DELETE | `/api/invites/[token]` | Revoke an unused invite |
| POST | `/api/db/snapshot` | Body: `{ message? }`. Pushes a snapshot. Returns `{ ok, sha, unchanged }` |
| GET | `/api/db/snapshots` | List this lab's snapshot history (last 50) |
| GET | `/api/db/restore/commits` | List recent commits in the configured repo touching this lab's path (last 30) |
| POST | `/api/db/restore` | Body: `{ commit_sha, confirm: <lab name> }`. Wipe + replay. Returns `{ ok, counts, missing }` |

## Users + personnel (admin)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | List own-lab users + NULL-lab pending users |
| POST | `/api/users` | Body via `UserCreateBody` zod schema. Creates a local account in the caller's lab |
| PUT | `/api/users/[id]` | Body via `UserUpdateBody`. Anti-lockout: can't demote/delete self; cross-lab move forbidden |
| DELETE | `/api/users/[id]` | Soft-delete: wipes sessions, clears password, sets `is_deleted=1` |
| POST | `/api/users/[id]/reset-password` | Body: `{ password }`. Sets `must_change_password=1` |
| GET | `/api/personnel` | List active personnel for the lab |
| POST | `/api/personnel` | Body via `PersonnelCreateBody` |
| PUT | `/api/personnel/[id]` | Body via `PersonnelUpdateBody` |
| DELETE | `/api/personnel/[id]` | Soft-delete (`is_active=0`) |

## CRUD entities

Every entity follows the same shape:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/<entity>` | Optional query filters (`project_id`, `sample_id`, etc.) |
| POST | `/api/<entity>` | Create. Validates parent FKs cross-lab via `assertLabOwnsRow` |
| GET | `/api/<entity>/[id]` | 404 cross-lab |
| PUT | `/api/<entity>/[id]` | 404 cross-lab |
| DELETE | `/api/<entity>/[id]` | Soft-delete (sets `is_deleted=1`) |

Entities: `projects`, `sites`, `samples`, `extracts`, `pcr-plates`,
`pcr` (amplifications), `library-plates`, `libraries`, `runs`.

Special cases:

- **Samples**: also accepts arbitrary MIxS slot keys not on the
  samples table; routed into `sample_values` EAV. See
  `src/lib/server/sample-body.ts`
- **PCR plates**: POST creates the plate + all amplifications in one
  transaction. See `src/routes/api/pcr-plates/+server.ts`
- **Library plates**: same shape. Creates the plate + library_preps
  in one transaction
- **Photos**: nested under entity — `POST/GET/DELETE
  /api/{samples,sites}/[id]/photos[/photoId]`. Multipart upload, MIME
  whitelist, 15 MB cap. GET sends `X-Content-Type-Options: nosniff`
- **Saved carts**: `POST/PUT/DELETE /api/saved-carts/[id]` — owner
  + public visibility logic

## Settings (constrained values, primer sets, pcr protocols)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/settings/constrained-values` | List for caller's lab |
| POST | `/api/settings/constrained-values` | Body: `{ category, value, label, sort_order? }` |
| PUT | `/api/settings/constrained-values/[id]` | Edit one |
| DELETE | `/api/settings/constrained-values/[id]` | Soft-delete (`is_active=0`) |
| GET | `/api/settings/primer-sets` | List |
| POST | `/api/settings/primer-sets` | Create |
| PUT | `/api/settings/primer-sets/[id]` | Edit |
| DELETE | `/api/settings/primer-sets/[id]` | Soft-delete |
| GET | `/api/settings/pcr-protocols` | List |
| POST | `/api/settings/pcr-protocols` | Create |
| PUT | `/api/settings/pcr-protocols/[id]` | Edit |
| DELETE | `/api/settings/pcr-protocols/[id]` | Soft-delete |

## MIxS import + export

| Method | Path | Notes |
|---|---|---|
| POST | `/api/import/mixs` | Multipart with `file` (xlsx or tsv), `projectId`, `dryRun`, `columnMap`, `siteMatchKm`, `people`, `defaultChecklist`, `defaultExtension`. See [MIxS pipeline](mixs.md). Rate-limited 1/sec/IP |
| GET | `/api/export/mixs` | Query: `project_id?`, `checklist?`, `extension?`, `format=tsv`. Returns TSV |

## Feedback

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/feedback` | admin | List own-lab + NULL-lab feedback |
| POST | `/api/feedback` | **public** | Body: `{ message, page_url }`. Sets `lab_id` from session if any. Rate-limited 5/min/IP |
| PUT | `/api/feedback/[id]` | admin | Edit status (`open` / `resolved` / `wontfix`) |
| DELETE | `/api/feedback/[id]` | admin | Hard delete |

## Scan resolution

| Method | Path | Notes |
|---|---|---|
| GET | `/api/id/[uuid]` | Resolves a scanned UUID to its entity type + redirect target. 404 if cross-lab or not found |
