# Dev docs

Codebase orientation, contracts, and design decisions. If you're
hacking on the source, this is the section to scan first.

## Pages

| Page | Covers |
|---|---|
| **[Architecture](architecture.md)** | Tech stack, single-process model, lazy DB init, scheduler, build & deploy story |
| **[Database schema](schema.md)** | Full DDL walk-through, table relationships, FK strategy, no-migration policy |
| **[Auth & sessions](auth.md)** | OAuth + bcrypt, session lifecycle, RBAC, the must-change-password and lab-setup gates |
| **[Multi-lab tenancy](multi-lab.md)** | The lab_id boundary, cross-lab 404 strategy, where the guards live, what's lab-scoped vs. global |
| **[API reference](api.md)** | Every REST endpoint, what it accepts, what it returns, who can call it |
| **[Security](security.md)** | CSP, headers, rate limits, OWASP-top-10 walk-through, threat model |
| **[GitHub backup & restore](backup.md)** | Snapshot pipeline, the skip-if-unchanged optimization, restore transaction shape |
| **[MIxS pipeline](mixs.md)** | LinkML YAML → JSON indices → form behavior → import validation |
| **[MIxS audit notes](mixs-audit.md)** | Historical record of the MIxS 6.3 alignment pass |

## How the source is organized

```
src/
├── lib/
│   ├── server/      # better-sqlite3, auth, guards, lab-scope, github, MIxS
│   ├── mixs/        # LinkML schema indices + UI helpers
│   └── components/  # Svelte 5 components (DataTable, MapPicker, PlateView, …)
└── routes/
    ├── api/         # REST endpoints (one folder per resource)
    ├── auth/        # OAuth callback, login, signup, setup-lab, join/[token]
    ├── account/     # avatar, password, self-delete
    ├── settings/    # the Manage UI
    └── <crud>/      # projects, sites, samples, extracts, pcr, libraries, runs, analysis
```

[Architecture](architecture.md) walks the request path through this
tree.

## Conventions

- **Schema is the source of truth.** No migration runner, no
  `addColumn`, no `runMigrations`. Schema changes are wipe-and-reseed.
  See [Database schema](schema.md).
- **Cross-lab access returns 404, not 403.** No existence-leak for
  attackers iterating UUIDs across labs. See [Multi-lab
  tenancy](multi-lab.md).
- **Edit pages mirror create pages.** Same fields in the same order.
  Tested by hand because we don't have visual regression testing yet.
- **No CHECK constraints on operator-managed vocabulary.** Only
  SRA/MIxS-mandated values get DB-level enums; everything else lives in
  the `constrained_values` picklist table so labs can customize.
- **MIxS slots win over SRA when they overlap.** Store MIxS, derive
  SRA at export via the mapping table.
- **Resolved feedback stays in the DB.** `UPDATE status='resolved'`,
  not `DELETE`, until the operator explicitly asks.
- **Server-side rendering matters.** Page loads SSR data via
  `+page.server.ts`; we don't ship anonymous-accessible CSR routes for
  authenticated content because the SSR data fetch would 401-loop in
  the browser.

## Build + deploy

`./deploy.sh` reads `.deploy.env` and:

1. `git push origin main`
2. `ssh $REMOTE` →
3. `git pull --ff-only`
4. `npm ci`
5. `npm run build` (SvelteKit production build to `build/`)
6. `set -a; . ./.env; set +a; pm2 restart sampletown --update-env`

The docs site builds in a separate workflow — `mkdocs gh-deploy` from
GitHub Actions on every push to `main` that touches `docs/` or
`mkdocs.yml`. See `.github/workflows/docs.yml`.
