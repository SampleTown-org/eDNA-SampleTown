# Auth & sessions

Hybrid authentication + lab-scoped RBAC + a couple of redirect-gate
flows for "you must do X before doing anything else" states.

## Two authentication paths

### GitHub OAuth (the primary path)

Implemented via [`arctic`](https://arctic.js.org/). Flow:

1. User clicks "Sign in with GitHub" → `/auth/login/github` mints a
   random `state`, sets it as an `httpOnly` cookie, redirects to
   GitHub's authorize URL.
2. GitHub redirects back to `/auth/login/github/callback` with `code`
   + `state`. The handler `timingSafeEqual`s the returned state
   against the cookie (cross-browser fixation defense).
3. `arctic` validates the auth code → access token → we GET
   `https://api.github.com/user` for the profile.
4. `upsertGitHubUser()` creates or updates the local users row keyed
   on `github_id`. Previously soft-deleted users are re-enabled
   (`is_approved=1, is_deleted=0`) so they can re-auth and accept a
   fresh invite. New users start with no `lab_memberships` row.
5. Session row created, cookie set, redirect to `/`.

Brand-new GitHub signups land at `/auth/setup-lab` because
`blockedByMissingLab` redirects any signed-in user with no active
membership (i.e. `user.lab_id=NULL` from the session query) to that
page (everything except `/account`, `/auth/setup-lab`,
`/auth/join/<token>`, and `/auth/logout` is gated until they pick a
lab).

### Local accounts

bcrypt at cost 12. Used for:

- The seeded `admin/admin` bootstrap account
- Ship/LAN deployments where GitHub OAuth isn't reachable
- Admin-created accounts (Manage → People → Add local user)

Login at `/auth/login/local` (form POST). Server-side rate limit: 5
attempts per minute per IP.

Username enumeration is mitigated by a constant-time path: when the
username doesn't match any row, we still run `bcrypt.compare` against
a dummy hash *at the same cost (12)* as real passwords. This was a
real bug — the dummy hash used to be cost 10 and gave away username
existence via a measurable timing delta.

Password length policy: 10–128 chars on SET, no length check on
VERIFY (so the seeded `admin/admin` 5-char bootstrap can sign in once
before the must-change-password gate forces a real password).

## Sessions

- Server-side rows in `sessions` (id, user_id, expires_at, created_at)
- Cookie value is an opaque 32-char hex; the cookie is `httpOnly`,
  `sameSite=lax`, and `secure` when `ORIGIN` starts with `https://`
- Default lifetime: 14 days, no sliding window — a session expires
  exactly 14 days after creation regardless of activity
- Periodic sweep in `maybeSweepExpired()` (rate-limited to once per 5
  minutes per process) deletes expired sessions + expired oauth_states

`validateSession()` joins `sessions × users × lab_memberships` (LEFT
JOIN on active membership). `user.lab_id` and `user.role` are sourced
from the membership row (`m.lab_id`, `COALESCE(m.role, 'user')`). If
the user has no active membership, both come back null/default and the
hooks gate redirects to `/auth/setup-lab`.

## RBAC

Three roles: `admin`, `user`, `viewer` — **per-lab** via
`lab_memberships.role`.

- **`admin`** — full lab access; can manage users, picklists, primer
  sets, PCR protocols, personnel, invites, backup config, snapshots;
  can delete the lab.
- **`user`** — read + write all lab data; cannot manage other users
  or invites.
- **`viewer`** — read-only on every lab resource; can change own
  password and submit feedback only.

A user can be `admin` of one lab and `viewer` of another. There's no
super-admin role; cross-lab operations require direct DB access.

## hooks.server.ts gates

In order:

1. **API auth gate** — `if (!user && !isPublicApi(path, method))` →
   401
2. **API admin gate** — for paths under `ADMIN_WRITE_PREFIXES`
   (`/api/users`, `/api/db/`, `/api/feedback/`, `/api/invites`,
   `/api/lab`) on POST/PUT/PATCH/DELETE, plus a few admin-only GETs
   (`/api/feedback`, `/api/users`, `/api/invites`,
   `/api/lab/settings`, `/api/lab/settings/test`,
   `/api/db/snapshots`, `/api/db/restore/commits`) → 403 if
   `user.role !== 'admin'`
3. **Viewer write gate** — viewers are 403'd on any `/api/*` mutation
   except their own `/api/account/password` and `POST /api/feedback`
4. **Public page gate** — non-`/api/`, non-`/auth/`, non-`/_app/`
   pages require a session → redirect to `/auth/login` with a
   `?next=` back here
5. **Password-change gate** (`blockedByPasswordChange`) — users with
   `must_change_password=1` can only reach `/auth/change-password`,
   `/auth/logout`, `/api/account/password`. Everything else
   redirects/403's
6. **Lab-setup gate** (`blockedByMissingLab`) — signed-in users with
   `lab_id=NULL` can only reach `/auth/setup-lab`, `/auth/logout`,
   `/auth/join/<token>`, `/api/auth/setup-lab`, `/api/auth/join`,
   `/account`, and `/api/account/*`. Everything else redirects/403's

After `resolve(event)`, `applySecurityHeaders(response)` adds HSTS
(when ORIGIN is HTTPS), X-Frame-Options DENY, X-Content-Type-Options
nosniff, Referrer-Policy strict-origin-when-cross-origin, and
Permissions-Policy. CSP is configured separately in
`svelte.config.js` via `kit.csp.mode: 'hash'` so SvelteKit can
fingerprint its own inline SSR scripts.

## Self-serve onboarding

The signup story:

1. New user signs in via GitHub → user row created, no memberships
2. Lab-setup gate redirects to `/auth/setup-lab`
3. Two paths:
   - **Start a new lab** → POST `/api/auth/setup-lab` with `{ name,
     slug? }` → creates a labs row, seeds picklists / primer sets /
     pcr protocols for it, creates an `admin` membership, sets
     `active_lab_id`. Rate-limited 3/day/IP. Works for both
     first-time signups and existing users adding a lab.
   - **Join an existing lab** → admin generates a 24-byte URL-safe
     invite token at `Manage → People → Lab Invites`. The recipient
     visits `/auth/join/<token>` (signs in if not already), POSTs to
     `/api/auth/join`. Creates a membership row. If the user has a
     **blocked** membership in that lab, the invite is rejected.
     Atomic `UPDATE invites SET used_at = NOW WHERE token = ? AND
     used_at IS NULL` so concurrent accepts can't double-spend.

Invite role + email_hint are set at creation; default TTL 14 days
(max 90).

## Lab switching

Users with memberships in multiple labs see a dropdown in the navbar
(next to "SampleTown.org / Lab Name"). Selecting a lab POSTs to
`/api/account/active-lab` which updates `users.active_lab_id` and
reloads the page. The dropdown also includes a "+ New lab" entry
linking to `/auth/setup-lab`.

## Password change

`POST /api/account/password` requires the OLD password (even when
`must_change_password=1`, so a stolen-cookie attacker can't lock out
the legitimate user). On success: invalidates every other session for
the user (the caller's session is preserved so they don't have to
re-login). Rate-limited 5/min/user.
