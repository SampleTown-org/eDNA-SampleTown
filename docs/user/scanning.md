# Scanning & labels

Physical labs use physical labels. SampleTown bridges the QR sticker
on a tube to the digital row in the database both ways.

## Generating sticker sheets

**Manage → Labels** is a small generator that emits Avery 5160
30-per-sheet PDFs of QR codes, ready to feed through a desk laser
printer.

Two modes:

1. **From the cart** — every entity currently in your cart becomes one
   label. The label includes the entity's name, the project, and the
   first 8 chars of its UUID. Useful for "I just created 24 samples,
   print labels for all of them".

2. **Blank pre-allocated** — pick a count (default 30, one sheet) and
   optionally a target entity type (sample / extract / pcr / etc.).
   Each label is a fresh UUID printed as a QR code with the type
   pre-encoded. Slap them on tubes *first*, then scan into the
   matching new-form to claim each one.

PDF is built client-side via jspdf so no server round-trip needed.

## Scanning

The QR icon in the navbar opens a camera modal (uses html5-qrcode
under the hood). Point at a sticker; on a successful decode it does
one of two things:

- **Existing entity** — the sticker's UUID matches a row already in
  the database → routes to that entity's detail page (e.g. `/samples/<uuid>`).
- **Pre-allocated UUID** — the sticker's UUID isn't in the DB yet →
  routes to `/id/<uuid>` (the "claim" page) which lets you pick what
  this should become. If the sticker was generated with a type hint
  (option 2 above), the claim picker is skipped and you go straight to
  the matching new-form (`/samples/new?id=<uuid>`).

Mobile cameras work fine — the read-only mobile UI explicitly keeps
the scanner button visible on phones.

## QR codes on detail pages

Every entity detail page renders its QR inline (small thumbnail with
click-to-enlarge). Useful when you've lost the physical label or want
to re-print one tube.

## Behind the scenes

- IDs are 32-char lowercase hex (16 random bytes). The `?id=…` query
  parameter on a new-form makes the new entity adopt that ID instead
  of minting one — the DB's primary-key constraint blocks duplicates.
- The QR encodes `https://<your-host>/id/<uuid>` so a non-SampleTown
  scanner just opens the claim page in a browser.
- The `claim` page is gated behind login like everything else.
