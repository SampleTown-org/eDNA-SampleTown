# User guide

What every signed-in user can see and do. Organized by workflow rather
than by route, so the same page might appear in two sections (e.g.
`/samples` shows up under both [Workflow](workflow.md) and [Sites &
samples](sites-and-samples.md)).

## Pages by section

| Section | Covers |
|---|---|
| **[Workflow](workflow.md)** | The data model — Project → Site → Sample → Extract → PCR → Library → Run → Analysis — and how the navbar maps to it |
| **[Sites & samples](sites-and-samples.md)** | Field-side: site creation, sample collection, MIxS completeness, photo galleries, the batch-entry form |
| **[Lab bench](lab-bench.md)** | Bench-side: extracts, PCR (plates + reactions), library prep, sequencing runs, analyses |
| **[Scanning & labels](scanning.md)** | QR sticker generation, the in-nav scanner, scan-to-claim and scan-to-detail flows |
| **[Cart](cart.md)** | The cross-entity cart sidebar, saved carts, map box-select, mobile drawer |
| **[MIxS export & import](mixs.md)** | Round-tripping with NCBI BioSample / SRA TSV + xlsx, the MIxS glossary |
| **[Manage (admin)](manage.md)** | Picklists, primer sets, PCR protocols, people + invites, backup + restore, danger zone |

## Common UI conventions

**Lab name on every page** — the dashboard h1 and every CRUD page's h1
prefix with the active lab's name (e.g. *"Cryomics Lab Sites"*) so a
viewer signed in to multiple labs can confirm at a glance which tenant
they're in.

**Role-based UI gating** — viewers see read-only versions of every
page; their write buttons (`Add Sample`, `Edit`, `Delete`) are hidden
client-side via the `write-only` CSS class. The same restrictions are
enforced server-side via [hooks](../dev/auth.md).

**Empty states are explicit** — a list page with zero rows says
*"Add a site first — samples are collected at sites."* rather than
just rendering an empty table. A new lab gets a hint cluster on the
project detail page so you don't have to guess what to click.

**Required-field highlighting on MIxS forms** — the
`MixsCompleteness` banner at the top of every sample/extract form
renders the active checklist + extension's required slots with a red
`*` marker, an inline progress count, and a list of still-missing
slots. See [Sites & samples](sites-and-samples.md) for the full flow.

**Scanner is one click away** — the QR icon in the navbar opens the
camera on any page. See [Scanning & labels](scanning.md).
