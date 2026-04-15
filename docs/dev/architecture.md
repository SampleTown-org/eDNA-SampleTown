# Architecture

Single-process SvelteKit app + embedded SQLite + a setInterval-based
backup scheduler. No queue, no Redis, no web sockets. Designed to run
on a single Linux VM behind nginx.

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| App framework | **SvelteKit 2** with **Svelte 5 runes** | SSR + filesystem routing; runes give us reactive `$state` / `$derived` without ceremony |
| Server runtime | **Node 20** via `@sveltejs/adapter-node` | Single binary, easy nginx reverse proxy, no Vercel/Cloudflare lock-in |
| Database | **SQLite** via **better-sqlite3** | One file, WAL mode, sync API, fits one-VM scale; backup is "rsync the file" |
| Auth | **arctic** (OAuth) + **bcrypt** (local) | Hybrid for hybrid use cases — OAuth in the office, local on the ship |
| Maps | **Leaflet** + OpenStreetMap tiles | Self-hosted JS + CSS; tiles fetched live from OSM |
| Spreadsheet I/O | **xlsx** (SheetJS CDN build) | NCBI BioSample templates ship as `.xlsx`; we want them to "just work" |
| Camera scan | **html5-qrcode** | Works on mobile + desktop, no native shim |
| Label PDFs | **jspdf** + **qrcode** | Generated client-side, no server round-trip |
| MIxS schema | **LinkML** YAML → JSON Schema → custom indices | Upstream is LinkML; we materialize a runtime-cheap JSON for fast lookups |
| Validation | **zod** + **ajv** | zod for our own POST bodies, ajv for MIxS-row validation against the LinkML JSON Schema |

## Process model

One pm2 process. On first request:

1. `getDb()` lazy-initializes the SQLite singleton — `journal_mode=WAL`,
   `foreign_keys=ON`, applies `schema.sql`, seeds the default lab if
   labs is empty, seeds picklists / primer sets / pcr protocols for
   that lab, seeds the `admin/admin` user if users is empty.
2. `startBackupScheduler()` installs a 15-minute `setInterval`. Every
   tick, queries every lab whose `backup_interval_hours` has elapsed
   since `last_backup_at` and pushes a snapshot for each (sequential,
   to avoid GitHub secondary rate limits).
3. Subsequent requests reuse the cached DB connection. better-sqlite3
   is synchronous; SvelteKit's request handling is async; the sync
   reads are fine because SQLite reads are fast and WAL allows
   concurrent reads.

There's no separate worker process. The scheduler runs in-process. If
the pm2 process restarts, the scheduler restarts on first request to
the new process.

## Request lifecycle

```
nginx (TLS, X-Forwarded-For)
  ↓
SvelteKit handler via @sveltejs/adapter-node
  ↓
src/hooks.server.ts handle()
  - getDb()  (lazy DB init)
  - maybeSweepExpired()  (expired sessions/oauth_states)
  - validateSession() → locals.user
  - if /api/* and !user → 401
  - if requiresAdmin && user.role !== 'admin' → 403
  - if blockedByViewerReadOnly → 403
  - if blockedByPasswordChange → redirect /auth/change-password
  - if blockedByMissingLab → redirect /auth/setup-lab
  ↓
+page.server.ts load() OR +server.ts handler
  ↓
applySecurityHeaders(response)  (HSTS, XFO, nosniff, Referrer-Policy)
  ↓
back to nginx → client
```

`hooks.server.ts` is the centralized auth + lab-membership gate. Every
guarded API endpoint *also* calls `requireUser` / `requireLab` /
`requireLabAdmin` itself for defense-in-depth — handler-level checks
are the source of truth, hooks are the floor.

## Build pipeline

`npm run build` runs the SvelteKit Vite build into `build/`. The
adapter-node output is a single Node entry point at
`build/index.js` plus a `client/` directory of immutable hashed
chunks. nginx serves nothing static; the Node process serves both the
HTML and the assets (with `Cache-Control: immutable` headers from
SvelteKit on the chunks).

`schema.sql` is loaded into the build via `?raw` import (Vite's
[raw import](https://vitejs.dev/guide/assets.html#importing-asset-as-string)
syntax) so it ships as a string inside the bundle — no separate file
to copy at deploy time.

The MIxS LinkML YAMLs are pre-compiled to JSON indices by
`scripts/mixs-build-index.mjs` (run during `mixs:update`) and committed
to the repo at `src/lib/mixs/generated/v6.3.0/`. The generated JSON is
imported as a regular ES module so it's tree-shaken with the rest of
the bundle.

## Deployment

`./deploy.sh` does push → ssh → pull → build → restart. See
[Deployment](../ops/deployment.md) for the full story including pm2
setup, nginx vhost, certbot, and the new-VM bootstrap script.
