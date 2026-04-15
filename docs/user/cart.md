# Cart

The cart is a cross-entity selection sidebar. You add things to it
from any list page, and downstream pages (PCR new, library new, label
generator, etc.) consume the cart contents to pre-populate themselves.

## Adding to the cart

Every list page (Projects, Sites, Samples, Extracts, PCR, Libraries,
Runs) has a checkbox column. Tick rows → the count badge on the cart
icon updates → click "Update Cart" to commit the selection. The cart
sidebar slides open automatically the first time you add something.

The maps on `/sites` and `/samples` support **shift-drag a rectangle**
to bulk-select pins into the cart. Useful for "select every site in
this fjord" without ticking 30 rows.

## Cart sidebar

A right-hand sidebar on desktop, a dismissible bottom drawer on mobile.
Items are grouped by type (sites first, then samples, then extracts,
…). Each item shows its name + sublabel + a remove (×) button.

The sidebar persists in `localStorage` per browser, so it survives
reloads and tab switches. **It is wiped on sign-out** so a shared
browser doesn't bleed selection into the next user's session.

## Saved carts

Once you've built a useful selection, click **Save** in the cart
header. Give it a name; optionally make it public so other lab members
can load it.

Saved carts live under your account; loading one **replaces** the
current selection (it's "load this saved view", not "merge"). Public
saved carts show up to every lab member with read access; private ones
only to you.

Owners can toggle public/private or delete a saved cart from the saved
carts list.

## Where the cart matters downstream

Several create flows pull from the cart:

- **`/pcr/new`** — pre-fills the source extracts from carted extracts
- **`/libraries/new`** — same, with carted PCRs or extracts as sources
- **`/runs/new`** — pre-fills libraries on the run
- **Manage → Labels** — the "from cart" mode prints one QR sticker per
  carted entity

## Filter-by-cart on list pages

`/samples` (and similar) honor cart contents as a parent filter — if
you have one project + two sites in the cart, the samples list narrows
to "samples in that project AND at one of those sites" via a small
funnel toggle in the page header. Toggle the funnel off to see all
again.
