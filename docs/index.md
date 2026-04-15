---
title: SampleTown
hide:
  - navigation
---

# SampleTown

**MIxS-compliant eDNA sample tracking** from field collection to sequencing run.
Built for marine research expeditions: works offline at sea, syncs when back
on network, and exports directly to NCBI BioSample / SRA submission templates.

Tracks the full chain:

```
Project → Site → Sample → Extract → PCR → Library Prep → Sequencing Run → Analysis
```

Free for academic and nonprofit use.
[Contact](mailto:hello@sampletown.org) for enterprise.

---

## Quick links

<div class="grid cards" markdown>

-   :material-rocket-launch: **[Getting started](getting-started.md)**

    Sign up, start a lab or accept an invite, create your first project.

-   :material-account-multiple: **[User guide](user/index.md)**

    What every page does, how the cart works, scanning + labels,
    MIxS import/export, the Manage tab.

-   :material-cog: **[Dev](dev/index.md)**

    Architecture, schema, auth, multi-lab boundaries, security headers,
    GitHub backup pipeline, REST API reference.

-   :material-server: **[Deployment](ops/deployment.md)**

    Long-running VM install, ship/LAN install, env vars, nginx,
    Let's Encrypt, pm2.

</div>

---

## What's it for?

A small-to-mid-sized environmental DNA lab generates a lot of structured data
that needs to survive from a wet lab notebook all the way through to a public
sequence repository submission. SampleTown tries to be the single point of
record for that whole pipeline:

- **Field collection** — what you scooped, where, when, and into what storage
  preservative. Lat/lon either typed or clicked on a map.
- **Lab bench** — extracts from samples, PCRs from extracts (organized as
  whole plates, not single reactions), library preps from PCRs or extracts,
  sequencing runs of those libraries, downstream analyses.
- **Standards-aligned** — column names mirror MIxS 6.3 LinkML slots 1:1, so
  exporting a project as an NCBI BioSample TSV is one click. The full GSC
  checklist family × extension matrix (276 combinations) drives required-slot
  validation on every form.
- **Multi-lab** — one install hosts multiple research groups, each isolated.
  Self-serve onboarding via GitHub OAuth; lab admins invite teammates with a
  single token URL.

## What it isn't (yet)

- A LIMS for clinical samples
- A bioinformatics pipeline runner (we track *what* you ran, not run it for you)
- A public-facing data portal — SampleTown is the inside-the-lab sample-of-truth;
  exporting to ENA/SRA + a per-project DOI is the publishing path

## Where to start

If you're a **lab admin** setting up a new install or onboarding a team,
start with [Getting started](getting-started.md).

If you're a **lab member** using an existing install, jump to the
[User guide](user/index.md) — specifically [Workflow](user/workflow.md)
for the data-model overview and [Sites & samples](user/sites-and-samples.md)
for the field-entry flow.

If you're a **developer** picking up the codebase, the [Dev](dev/index.md)
section is the entry point — start with [Architecture](dev/architecture.md)
and [Database schema](dev/schema.md).
