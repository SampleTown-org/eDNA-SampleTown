# Security

Inventory of the security controls in the codebase, why they're there,
and what's still TODO.

## Threat model

SampleTown is a small-team eDNA tool, not a clinical EHR. Realistic
threats:

- **Casual unauthorized access** — a stranger guessing URLs or
  iterating IDs across labs
- **Stolen session cookie** — laptop left open at a conference
- **Lab-cross-contamination** — Lab A user accessing Lab B data
  through ID guessing or API misuse
- **Stale credentials** — old GitHub PATs or OAuth client secrets
  surfacing in commits or backups
- **Standard web nasties** — XSS, CSRF, click-jacking, CSP bypass,
  open redirect

Out of scope:

- Sophisticated targeted attacks
- Insider attacks by trusted lab admins (who have legit access to
  their lab's data)
- Side-channel attacks against bcrypt/SQLite

## Multi-lab boundary (404 semantics)

See [Multi-lab tenancy](multi-lab.md). Cross-lab access returns 404
to avoid existence-leaks. Every API handler calls `requireLab` /
`requireLabAdmin` and either filters list queries by `lab_id = ?` or
runs `assertLabOwnsRow` on point-lookups.

## Sessions + auth

- Server-side rows in `sessions`, opaque 32-char hex cookie
- 14-day fixed expiry; no sliding window
- `httpOnly`, `sameSite=lax`, `secure` (when ORIGIN is HTTPS)
- `validateSession` checks `is_approved=1` and `is_deleted=0` so
  suspending/deleting a user instantly invalidates their open sessions
- bcrypt cost 12 for both real password hashes and the dummy-hash
  enumeration mitigation
- Open-redirect defense on the local-login `?next=` parameter — only
  paths starting with `/` and not `//` are honored

## CSRF

SvelteKit's `csrf_check_origin` blocks cross-origin POST/PUT/PATCH/
DELETE for `Content-Type: application/x-www-form-urlencoded`,
`multipart/form-data`, and `text/plain`. JSON requests are protected
by browser CORS preflight (we don't ship `Access-Control-Allow-Origin:
*` anywhere, so non-CORS-preflight cross-origin JSON is impossible).

`POST /api/feedback` is the only public mutation; protected by per-IP
rate limit (5/min) so spam is bounded.

## Security headers

Set in `src/hooks.server.ts` `applySecurityHeaders()` after
`resolve(event)`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin` (was
  `same-origin`, but that broke OSM tile servers; the new value still
  hides the page path while sending the bare origin)
- `Permissions-Policy: geolocation=(self), camera=(self)`
- `Strict-Transport-Security: max-age=15552000; includeSubDomains`
  when ORIGIN starts with `https://`

CSP is configured separately in `svelte.config.js` via SvelteKit's
built-in `kit.csp.mode: 'hash'`. SvelteKit emits a sha256 for every
inline `<script>` it generates for SSR data hydration so we can run
with `script-src 'self'` (no `'unsafe-inline'`). Style-src is `'self'
'unsafe-inline'` because Svelte component styles compile to inline
`<style>` blocks.

## Rate limits

In-memory sliding-window per IP (and sometimes per user). Single
process so no cross-process coordination needed; if we ever scale to
multiple workers, swap for nginx `limit_req` or a SQLite-backed
counter.

| Endpoint | Limit |
|---|---|
| `POST /auth/login/local` | 5 attempts / minute / IP |
| `POST /api/feedback` | 5 / minute / IP (anonymous) |
| `POST /api/import/mixs` | 1 / second / IP (auth required) |
| `POST /api/account/password` | 5 / minute / user |
| `POST /api/auth/setup-lab` | 3 / day / IP |
| `POST /api/auth/join` | 10 / hour / IP |

**IMPORTANT in production**: behind nginx, `getClientAddress()`
returns the socket peer (always 127.0.0.1) unless `ADDRESS_HEADER` is
set. Production `.env` should have:

```bash
ADDRESS_HEADER=X-Forwarded-For
XFF_DEPTH=1
```

Without this, every request shares the same rate-limit bucket. See
[Deployment](../ops/deployment.md).

## Photo upload safety

`POST /api/{samples,sites}/[id]/photos` accepts multipart with a
client-supplied MIME type. Validation:

- MIME must be in `ALLOWED_IMAGE_MIME` (jpeg/png/webp/gif)
- Size cap 15 MB
- Stored filename is `<server-generated-uuid>.<ext>` where `ext` is
  whitelisted via `MIME_TO_EXT`. `file.name` (user's filename) is
  stored in `original_filename` for display only — never used for
  filesystem ops
- Photo GETs send `X-Content-Type-Options: nosniff` so old browsers
  don't sniff a crafted "image/jpeg" payload as HTML

Magic-byte verification on upload is TODO — currently we trust the
client's MIME type within the whitelist.

## SQL injection

All user-supplied values go through `db.prepare(...)` with `?`
placeholders. Table names interpolated into queries (e.g.
`exportTablesAsJson`'s `SELECT * FROM ${table}`) are pulled from
hardcoded `TABLES_TO_EXPORT` constants — no user input ever reaches
the SQL.

## Secrets at rest

- `.env` on disk is owned by the app user, mode 600 by convention
- Per-lab GitHub PATs are stored plaintext in
  `labs.github_token`. Same risk profile as `.env`. Encrypt at rest
  is a future hardening item if we get a use case for it
- Bcrypt hashes for local accounts at cost 12

## Known follow-ups

From the 2026-04-09 audit, deferred:

- **Magic-byte sniffing** on photo uploads to defend against
  client-MIME spoofing
- **Per-lab admin UI for picklist sync** so SEED_DATA additions can
  flow into existing labs without manual SQL
- **CSP nonces** — drop `'unsafe-inline'` from `style-src` once we
  thread nonces through SvelteKit's component-style emission
- **Magic-byte and EXIF-strip** on photo uploads for paranoia
- **Encrypt at rest** for `labs.github_token`
- **Audit log** of admin actions (lab delete, user delete, role
  change, invite generation)
