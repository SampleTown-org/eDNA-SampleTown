# Multi-lab tenancy

One install, many labs, hard isolation between them.

## The boundary

Every top-level entity table carries a `lab_id` column. Cross-lab
access — a user signed into Lab A trying to read or write a row that
belongs to Lab B — returns **404, not 403**. The 404 is intentional:
a 403 would tell the attacker the row exists.

Tables that carry `lab_id`:

- `labs` (the parent)
- `users` (nullable — unset until a user picks a lab)
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

For list endpoints, the filter goes straight in the WHERE clause:

```ts
db.prepare('SELECT * FROM samples WHERE lab_id = ? AND is_deleted = 0').all(labId);
```

For POST handlers that reference parent rows, validate the parent's
lab too:

```ts
assertLabOwnsRow(db, 'projects', data.project_id, labId, 'Project not found');
assertLabOwnsRow(db, 'sites', data.site_id, labId, 'Site not found');
// then INSERT INTO samples (..., lab_id, ...) VALUES (..., labId, ...)
```

## Why 404 not 403

Returning 403 ("forbidden") on a row that exists in another lab leaks
existence — an attacker iterating UUIDs would see a 403 spike on
real-but-foreign rows vs. a 404 on truly nonexistent ones. We don't
distinguish: every cross-lab read or write looks identical to "row
doesn't exist".

`assertLabOwnsRow` enforces this:

```ts
const row = db.prepare(`SELECT lab_id FROM ${table} WHERE id = ?`).get(id);
if (!row || row.lab_id !== labId) {
  throw error(404, notFoundMessage ?? 'Not found');
}
```

The `LAB_SCOPED_TABLES` allowlist in `lab-scope.ts` ensures the table
name passed in is one we know carries `lab_id`. Throws a hard error
otherwise (development-time check).

## Lab membership lifecycle

- **Brand-new GitHub OAuth signup** — `lab_id = NULL`, hit the
  lab-setup gate → `/auth/setup-lab` → either creates a new lab
  (becomes its admin) or accepts an invite token.
- **Pre-existing user (e.g. seeded admin)** — `lab_id` set to the
  default lab on first boot.
- **Accepting an invite** — sets `lab_id` to the inviting lab, role
  to whatever the invite token specified. Overwrites any prior
  membership (no multi-lab membership in v2).
- **Lab deletion** — cascades all lab-scoped data. Members' `lab_id`
  is null'd and `role` reset to `user`; their sessions are wiped
  (except the deleting admin's, so they get a graceful redirect).
- **User self-delete** — soft-delete (`is_deleted=1`), sessions
  wiped, password hash cleared. Last-admin guard refuses if you're
  the only admin of your lab.

## Cross-lab user views

The Manage → People tab is special-cased: the admin sees their own
lab's users PLUS users with `lab_id IS NULL` (pending OAuth signups).
Same for feedback (own-lab + NULL-lab anonymous). Same for invites
(own-lab only).

Updating another user's `lab_id` via `PUT /api/users/[id]` is
restricted to "your own lab or null" — a lab-admin can claim a
pending OAuth signup into their own lab, but cannot move them into
another lab.

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
