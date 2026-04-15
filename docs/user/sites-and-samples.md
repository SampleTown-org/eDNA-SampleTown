# Sites & samples

The field-side workflow. Sites are sampling locations; samples are
what you collected at them.

## Creating a site

`/sites/new` — accessible from the navbar, the `/sites` index, or from
a project detail page (which pre-fills the project_id).

**Required:** project, site name, latitude + longitude, environment
descriptors. Click the map to drop a pin (rounds to 4 decimal places
~= 11 m); typed lat/lng works too. The geo + environment dropdowns are
populated from your lab's picklists (Manage → Picklists →
`geo_loc_name` / `env_broad_scale` / `env_local_scale`).

**Optional:** description, locality, access notes (boat-only, permit
required, trail conditions), free-text notes, and **photos** — staged
client-side and uploaded after the site is saved.

Site names are unique within a project.

## Creating a sample

`/samples/new` (single) or `/samples/batch` (multiple). The batch mode
transposes the form: parameters become rows, samples become columns, so
you can enter "the same env_medium across these 12 samples" by typing
once and using fill-right.

**Required by SampleTown:** project + site + samp_name + collection_date
+ env_medium (the MIxS core). The site drives a lot of the geo
fields automatically at export time.

**Required by MIxS** depends on the selected (checklist, extension)
combination — typically `MimarksS` or `MimarksC` × an extension like
`Water` / `Soil` / `HostAssociated`. The form's
`MixsCompleteness` banner highlights required slots in red, shows a
"N of M filled" progress count, and lists any still-missing slots.

### MIxS completeness, in detail

The 786 MIxS slots are organized into 14 checklist classes (MimarksS,
MimarksC, Mims, Mimag, Misag, MigsBa, MigsEu, MigsOrg, MigsPl, MigsVi,
MimsMisip, Miuvig, plus a couple of profile classes) and 23 extension
classes (Water, Soil, Sediment, HostAssociated, Air, etc.). Combining
a checklist and an extension produces 276 materialized combination
classes that drive the per-sample required-slot list.

When you change the checklist or extension on the form:

- Required slots for the new combination get the red `*` marker
- Slots that were required and got dropped lose their marker
- The progress count + missing-slots list update reactively
- The export-template column order updates accordingly

## Photos

Per-site and per-sample photo galleries support JPEG, PNG, WebP, and
GIF up to 15 MB each. Upload from the detail page or stage them
client-side during batch sample entry — the photos upload in sequence
after the entity is saved.

The detail page shows thumbnails with click-to-enlarge. List pages
show a photo-count chip per row.

## Maps

`/sites` and `/samples` index pages each render a Leaflet map alongside
the table. Click a pin to highlight the corresponding row, or
**shift-drag a rectangle** to bulk-select pins into the cart. Color-by
controls live on the table header — pick any column and the pin colors
adopt a rank-based hue gradient matching the column's distinct values.

## Editing & deleting

Edit pages mirror their create-page counterparts exactly — same fields
in the same order. Soft-delete is the default (sets `is_deleted=1` so
created_by attribution stays linkable in reports); hard delete is
admin-only via direct DB intervention.
