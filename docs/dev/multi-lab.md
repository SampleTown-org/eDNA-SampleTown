# Multi-lab tenancy

One install, many labs, hard isolation between them. A user can belong
to multiple labs with independent roles in each.

## Data model

Lab access is expressed through the `lab_memberships` join table:

```
lab_memberships(user_id, lab_id, role, status, added_at, added_by)
  PK: (user_id, lab_id)
  role  IN ('admin', 'user', 'viewer')
  status IN ('active', 'blocked')
```

`users.active_lab_id` points at whichever lab the UI is currently
rendering. The navbar lab-switcher updates this via
`POST /api/account/active-lab`.

### Legacy columns on `users` (retained on prod, not read by code)

- `lab_id` — original single-lab FK. Kept so `SELECT *` doesn't fail
  on older rows. No code path reads this.
- `role` — original global role. Roles are now per-lab on memberships.
- `is_deleted` — replaced by "no memberships" + `is_approved=0`.

### Migration

`scripts/migrate-to-lab-memberships.mjs` backfills one membership per
existing non-soft-deleted user and copies their `lab_id` into
`active_lab_id`. Idempotent. Run once on prod after deploy.

## The boundary

Every top-level entity table carries a `lab_id` column. Cross-lab
access — a user signed into Lab A trying to read or write a row that
belongs to Lab B — returns **404, not 403**. The 404 is intentional:
a 403 would tell the attacker the row exists.

Tables that carry `lab_id`:

- `labs` (the parent)
- `lab_memberships` (the join)
- `projects`, `sites`, `samples`
- `extracts`, `pcr_plates`, `pcr_amplifications`
- `library_plates`, `library_preps`
- `sequencing_runs`, `analyses`
- `personnel`, `constrained_values`, `primer_sets`, `pcr_protocols`
- `saved_carts`, `feedback`, `db_snapshots`, `invites`

Tables without `lab_id` (lab-scoped via parent FK or genuinely global):

- `sample_values` → via `sample_id`
- `site_photos` → via `site_id`
- `sample_photos` → via `sample_id`
- `entity_personnel` → via `personnel_id` (and the entity_id refs
  whatever the entity_type points at)
- `saved_cart_items` → via `cart_id`
- `run_libraries` → via `run_id`
- `sessions`, `oauth_states`, `sync_log` → genuinely global

## Where the guard lives

Three helpers in `src/lib/server/guards.ts`:

```ts
requireUser(locals)         // 401 if no session
requireLab(locals)          // requireUser + 403 if user.lab_id is null
                            // returns { user, labId }
requireLabAdmin(locals)     // requireLab + 403 if user.role !== 'admin'
```

`user.lab_id` and `user.role` are sourced from the active membership
via a LEFT JOIN in `validateSession()`. If the user has no active
membership for their `active_lab_id`, both come back null/default and
the hooks gate redirects to `/auth/setup-lab`.

Plus one helper in `src/lib/server/lab-scope.ts`:

```ts
assertLabOwnsRow(db, table, id, labId, notFoundMessage?)
// 404 if the row doesn't exist OR belongs to a different lab
```

Pattern in every API handler:

```ts
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { labId } = requireLab(locals);
  const db = getDb();
  assertLabOwnsRow(db, 'samples', params.id!, labId, 'Sample not found');
  // ... safe to UPDATE / DELETE samples WHERE id = ? now
};
```

## Why 404 not 403

Returning 403 ("forbidden") on a row that exists in another lab leaks
existence — an attacker iterating UUIDs would see a 403 spike on
real-but-foreign rows vs. a 404 on truly nonexistent ones. We don't
distinguish: every cross-lab read or write looks identical to "row
doesn't exist".

## Lab membership lifecycle

- **New GitHub OAuth signup** — no memberships. Hooks gate redirects
  to `/auth/setup-lab` → either creates a new lab (becoming its admin)
  or accepts an invite token.
- **Accepting an invite** — creates a `lab_memberships` row with the
  invite's role. Sets `active_lab_id` to the new lab. If the user is
  **blocked** in that lab, the invite is rejected.
- **Creating an additional lab** — via the navbar lab-switcher
  "+ New lab" or `/auth/setup-lab`. No limit on how many labs a user
  can belong to (rate-limited per IP at 3 creations/day).
- **Removing a user from a lab** — admin deletes the membership row.
  Sessions are revoked. If the user's `active_lab_id` pointed here,
  it's cleared (they fall through to setup-lab or their next lab).
- **Blocking a user** — admin sets `status='blocked'` on the
  membership. Blocked users can't re-join via invite; admin must
  explicitly unblock first.
- **Lab deletion** — cascades all lab-scoped data + membership rows.
  Users with remaining memberships in other labs auto-fall-back to
  their next lab. Users with no remaining memberships see setup-lab.
- **User self-delete** — all memberships deleted, sessions wiped,
  password hash cleared. Last-admin guard refuses if you're the sole
  admin of any lab.

## Admin user views

The Manage → People tab shows only users with a membership in the
admin's lab (via `lab_memberships JOIN users`). No cross-lab leak of
unassigned signups.

## What's NOT lab-scoped

- **Sessions** — keyed on user; user is keyed on lab. Cascades
  naturally.
- **MIxS schema indices** (`src/lib/mixs/`) — same vocabulary for every
  lab; baked into the build.
- **The xlsx parser, scanner, label PDF generator** — pure UI / pure
  client.
- **The backup scheduler** — runs once per process, walks every lab.
  Each tick filters per lab; each backup pushes to that lab's own
  configured GitHub repo.
- **Default picklists / primer sets / PCR protocols** — seeded
  per-lab on creation. Each lab can edit independently. New seed
  entries added between releases do NOT auto-propagate to existing
  labs (no migration layer).
