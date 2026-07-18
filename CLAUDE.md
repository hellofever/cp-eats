@AGENTS.md

# Commonplaces

A shared map of favourite restaurants for a small group (<5 people). Tap a pin for
details, browse as a list, or maintain everything in a spreadsheet-style grid. Add a
restaurant by searching Google Places (autofills address/phone/hours) or entering it
manually.

## Tech Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind v4**, no `src/` dir. Deployed to Vercel.
- **Supabase** (Postgres + Auth + RLS) — the only write path, no Google Sheets
  integration. A spreadsheet-*feel* is provided by the in-app Sheet view instead (see
  UI structure, below), which stays schema-safe because it's still backed by RLS.
- **Google Maps JavaScript API** (`@vis.gl/react-google-maps`) renders the map — chosen
  over MapLibre/free tiles because it shares one API family with Places search, at
  negligible cost for <5 users (see Cost, below).
- **Google Places API (New)** — Text Search + Place Details — powers "search to add."
  Called only from server routes (`app/api/places/*/route.ts`), never from the browser,
  so the Places key never ships to the client. The routes require a signed-in caller:
  clients go through `lib/placesApi.ts` (`placesFetch`), which attaches the Supabase
  session token, verified server-side by `app/api/places/requireUser.ts` — an
  unauthenticated caller can't burn Places quota.
- **Auth:** Supabase email/password, tied to the owner's personal email. No magic link,
  no separate login route — `AppShell` shows `LoginForm` inline when there's no session.
  Sign-in only: there is deliberately no in-app sign-up (RLS grants full write access to
  any authenticated user, so open sign-up would mean open write access). New accounts
  are created from the Supabase dashboard, where "Allow new users to sign up" must also
  stay disabled (the Auth API is reachable with the public anon key regardless of UI).
- **UI components:** shadcn/ui (Radix-based, CLI v4 "nova" preset) — generated into
  `components/ui/` (`sheet`, `alert-dialog`, `context-menu`, `button`) with
  `components.json` + `lib/utils.ts` (`cn`). Adopted for interactive primitives only
  (sheets/dialogs/menus); plain buttons/inputs stay hand-rolled Tailwind for now. One
  local deviation from stock shadcn, preserve it when adding components: icons inside
  `components/ui/*` are swapped from lucide-react (not installed) to Phosphor.
- **Theme:** `next-themes`, toggled from Settings → Appearance (`components/ThemeToggle.tsx`,
  opened via the gear icon in `Header`). Drives a `.dark` class on `<html>`
  (`attribute="class"` in the `ThemeProvider` in `app/layout.tsx`) rather than relying on
  `prefers-color-scheme` directly — `app/globals.css` has `@custom-variant dark
  (&:is(.dark *));` (shadcn's normal init default) so `dark:` utilities respond to that
  class; a freshly `npx shadcn add`-ed component's CSS edits to globals.css must not
  revert that to a media-query-based variant. "System" still resolves to the same class
  via `enableSystem`, it isn't a separate code path.
- **Icons:** `@phosphor-icons/react` — the icon library for the whole app (e.g. the
  Sheet view's favourite star, add/delete/warning icons). Import icons by name (e.g.
  `import { Star, Trash } from "@phosphor-icons/react"`) and set `weight` (`"regular"` |
  `"fill"` | `"bold"` etc.) rather than swapping components for filled/outline states.

## Project Structure

- `app/` — routes: `page.tsx` (Map), `list/`, `sheet/`, `api/places/{search,details}/`
  (server-only Places proxy). No `src/` dir.
- `components/` — `AppShell` (auth gate + shared `RestaurantUIContext`), `MapView`,
  `AddRestaurantFlow` + `RestaurantForm` + `TagPicker` (shared add/edit flow),
  `RestaurantDetailView`, `LoginForm`, `BottomSheet` (thin wrapper over shadcn's Sheet,
  keeping the pre-shadcn `open`/`onClose` API), `Header` (also owns the Settings sheet),
  `ThemeToggle` (Light/Dark/System, lives inside Settings).
- `components/ui/` — shadcn/ui generated components (see UI components in Tech Stack;
  edited copies, not vendored verbatim).
- `components/sheet/` — inline-editable cell components used only by the Sheet view
  (`EditableTextCell`, `PriceCell`, `AddressCell`, `FavStar`).
- `components/ListFilters.tsx` — the List view's tag/area/favourites filter row.
- `lib/` — `supabase.ts` (client), `restaurants.ts` (fetch/insert/update/delete, tag-join
  normalization), `tags.ts` (tags/area/city taxonomy + palette), `types.ts`, `sort.ts`
  (List sort + area-grouping), `sheetSort.ts` (Sheet column sort/comparators),
  `geocode.ts` (address → coordinates, reuses the Places search route), `placesApi.ts`
  (authed fetch wrapper for the Places routes).
- `supabase/migrations/` — `0001_init.sql` (schema + seed), `0002_favourites.sql`
  (`is_favourite` column), `0003_rename_restaurants_tag.sql` (data fix),
  `0004_tag_icons.sql` (per-tag icon column), `0005_replace_restaurant_tags_fn.sql`
  (transactional tag-replace RPC used by `lib/restaurants.ts`). This *is* the
  schema source of truth — see "What to avoid" for the workflow around it.

## Data model

Defined across `supabase/migrations/` (see Project Structure for what each file adds),
RLS-gated to `auth.role() = 'authenticated'` throughout (no per-row ownership; it's a
shared list, not multi-tenant).

A unified `tags` table (`kind`: `'tag' | 'area' | 'city'`) plus a `restaurant_tags`
many-to-many join, superseding an earlier single `category` enum:

- **Tags** (Bakery, Cafe, Casual Eats, Restaurant, Dessert — seeded starting set) and
  **Area** (Inner West, City, Inner City, East, West, South, North, Regional — seeded) are
  both many-to-many with restaurants via `restaurant_tags`. Both are user-creatable from
  the add/edit form, not a fixed list — the seed rows are just a starting point.
- **City** (Sydney — seeded) uses the same table/join mechanism, but the app only ever
  lets you pick one per restaurant (single-select in the UI; nothing stops multiple at the
  DB level, it's just not offered).
- `restaurants.primary_tag_id` is a separate FK (not part of the join) that drives the map
  pin color — you designate one of a restaurant's tags as primary when saving. Tags get
  their color auto-assigned from a rotating palette when created.
- `google_place_id` (unique on `restaurants`) powers duplicate detection when adding a
  restaurant that's already on the list.
- `restaurants.is_favourite` (added in `0002_favourites.sql`) is a plain boolean, set
  independently of the main edit form via a dedicated toggle (`lib/restaurants.ts`
  `setFavourite`) — saving the form never touches it, so it can't be clobbered by an
  unrelated edit. Surfaced as a star in the detail view, List, and Sheet.

## Why Supabase, not Google Sheets

Sheets has no schema enforcement, no real auth model (anyone with the edit link can
change anything), no geospatial query support, and silent-overwrite risk on concurrent
edits. Supabase gives real constraints, RLS-scoped access, and PostGIS-ready geo indexing,
for the same $0 cost at this scale.

## Cost

Google Maps Platform's Essentials tier (Maps JS SDK, Places Autocomplete/Details) is free
up to ~10,000 calls/API/month. At <5 users this should stay $0/month. Still requires a
billing account on file — set a small budget alert and restrict both API keys (HTTP
referrer for the Maps key, API restriction only for the server-only Places key).
Sheet's address auto-geocode (see UI structure, below) reuses this same Places search
call rather than adding a separate Geocoding API — no new cost line to track.

## UI structure

Three views behind one segmented control (Map / List / Sheet), one shared search bar
(persisted via the `?q=` URL param so it survives navigation), one global "+ Add" button.
Wireframe: https://claude.ai/code/artifact/b78f30b8-062e-4169-b6c4-0352a6ff8691

- **Map** (`app/page.tsx`) — pins colored by `primary_tag_id`'s tag color; tap opens the
  detail sheet. Clustering (`@googlemaps/markerclusterer`, already installed) is deferred
  until the list is actually large enough to need it — not wired up yet.
- **List** (`app/list/page.tsx`) — browsing-oriented, name + tags/area/website/notes meta
  line (favourited rows get a leading ★). List items (including area sub-headings) are
  capped at `max-w-[800px]` and centered; the filter/sort row above them stays full-width.
  - *Filter* (`components/ListFilters.tsx`) — a collapsible row: tags/area as click-to-add
    pills (OR within a facet, AND across facets), plus a favourites-only toggle. State
    persists via `?tags=`/`?areas=`/`?fav=`, same pattern as the `?q=` search param.
  - *Sort* (`lib/sort.ts`) — Name, Recently added, Price, Favourites first, or Area. Area
    is a special case: instead of reordering the flat list, it renders sectioned
    sub-headings per area (alphabetical, a restaurant with multiple areas is duplicated
    under each one, a trailing "No area" group catches the rest).
  - Loading skeleton while fetching; a distinct empty state ("There are no places added" +
    an Add CTA) versus "no matches" when a search/filter just narrows the list to zero.
- **Sheet** (`app/sheet/page.tsx`) — edit-focused spreadsheet view, not a read-only table.
  - *Cell editing* — every column except City (read-only, matches it being hidden in the
    main form) is inline-editable: click a cell to edit text/price directly, click
    Tags/Area to open a pill-picker popover (`TagPicker` in a `BottomSheet`), click the
    Fav star to toggle instantly.
  - *Address* is inline-editable too, but changing it silently re-resolves coordinates via
    the same `/api/places/search` endpoint used for "search to add" (`lib/geocode.ts`)
    rather than a separate Geocoding API call — a row whose address couldn't be
    confidently resolved keeps its old coordinates and shows a warning icon linking to the
    full edit modal.
  - *Selection/delete* — checkboxes + a "Delete" action bar, behind a confirm dialog.
  - *Right-click a row* for a small context menu: "Go to place" (calls `openDetail` then
    navigates to `/?place=<id>` — the detail modal opens because `AppShell` lives in the
    root layout and its `RestaurantUIContext` state survives the route change; the
    `place` param separately tells `MapView` to pan/zoom there, since the map can't just
    use a smarter default center/zoom — the restaurant list it matches against loads
    asynchronously, after the map has already mounted) or "Delete" (selects just that
    row and reuses the same confirm-dialog flow as the checkbox-driven bulk delete).
  - *Empty trailing row* — its Name cell + "+" button launches the normal search/manual
    Add flow with the typed text prefilled as the search query (`openAddInline` in
    `AppShell` — saving from here does *not* pop the detail modal the way the header's
    "+ Add" does, it just drops the row into place). The row's other cells aren't
    independently editable pre-save (see Known simplifications).
  - *Paste* — tab-separated values (e.g. copied from Excel/Sheets), while any text-input
    cell is focused, cascade across the following cells/rows from that point. New rows
    can't be spawned this way (even with auto-geocoding, a row still needs a Name to exist
    first via "+"). Tags/Area paste text is parsed as comma-separated names and
    auto-creates any that don't already match.
  - *Sort* (`lib/sheetSort.ts`, click a column header) is independent of all of the above
    and of List's own sort — separate `?sheetSort=`/`?sheetDir=` params.
- **Add/Edit** (`components/AddRestaurantFlow.tsx` + `RestaurantForm` +
  `TagPicker`) — one shared flow/form for search-to-autofill, "add manually," and editing.
  `TagPicker` handles tags (multi), area (multi), and city (single) with inline
  "create new" — all three are freeform lists seeded with a starting set, not fixed
  enums. A restaurant's primary tag (colors its pin) is chosen among its selected tags,
  auto-picked when there's only one. Places' `primaryType` only *prefills the tag search
  box* with a suggested name (`suggestTagName` in `lib/tags.ts`) — it never selects or
  creates a tag on its own. Duplicate detection matches on `google_place_id` before the
  form ever opens.

- **Settings** — gear icon in `Header`, opens a `BottomSheet` with just an Appearance
  section (`ThemeToggle`: Light/Dark/System) for now. Local `useState` in `Header`, not
  part of `RestaurantUIContext` — it doesn't need to survive route changes the way the
  detail/add/edit sheet does.

All three views + the add/edit sheet share one `RestaurantUIContext`
(`components/AppShell.tsx`), which also owns the auth gate and the refresh-after-save
signal each page's data fetch listens for.

## Known simplifications (intentional, not bugs)

- No structured opening-hours editor yet — Places autofill populates it, manual entry
  leaves it null. A proper per-day hours editor is a fast-follow.
- No image handling for `photo_url` yet (schema column exists, unused in UI).
- A paste can't *originate* on the Fav/Tags/Area cells (they're not real text inputs, so
  there's nothing for the browser to fire a paste event on) — only text-input columns
  (Name/Phone/Address/Price/Notes) can be the anchor, though a wide-enough paste from one
  of those still reaches Fav/Tags/Area as a target. Sheet's "needs review" flag for a
  failed address geocode is in-memory only, not persisted — it's meant to catch a bad
  paste in the moment, not survive a reload.
- Sheet's empty trailing row only has its Name cell independently editable pre-save
  (plus the "+" button) — Tags/Phone/Price/Notes/Fav aren't individually draftable before
  a restaurant exists there. This was a unilateral scope call made during implementation,
  not an explicitly confirmed decision — flag if you actually want every cell in that row
  draftable ahead of save.
- Auth check is client-side only (no `@supabase/ssr` middleware/proxy setup) — acceptable
  because the real security boundary is Postgres RLS, not the client gate. Worth adding
  proper SSR session handling later for a cleaner logged-out experience.
- Node locally is v20.14; Supabase's JS packages prefer v22+ (warning only, not blocking).
  Worth upgrading Node at some point.

## Coding conventions

- No code comments unless they explain a non-obvious *why* (a workaround, a subtle
  invariant) — see e.g. the `primary_tag_id` and palette-rotation comments in
  `lib/tags.ts`/the migration. Don't add comments that just restate what the code does.
  Well-named identifiers already do that.
- Tailwind utility-first throughout, always pairing light/dark variants (`dark:` classes)
  rather than a separate theme stylesheet.
- Shared cross-page state (auth session, open sheet, refresh signal) goes through
  `RestaurantUIContext` in `AppShell`, not prop-drilling or a separate state library.
- Supabase reads/writes go through `lib/*.ts` helper functions (`fetchRestaurants`,
  `createTag`, etc.) — components don't call the Supabase client directly.

## What Claude should know

- This is **not** the Next.js you know from training data — read `@AGENTS.md` and the
  docs it points to before assuming an API/convention.
- The real security boundary is Postgres RLS, not the client-side auth gate in
  `AppShell` — don't "fix" the client-only auth check without discussing it first, it's
  a deliberate simplification (see Known simplifications).
- `@vis.gl/react-google-maps`'s `<Map>` component silently drops its own default
  `width:100%; height:100%` styling the moment you pass it a `className` — if the map
  ever goes blank/zero-height again, check the height chain (`html`/`body`/`main` all
  need a *definite* height, not just `min-height`) before assuming it's a JS crash.
- Always ask before deleting anything non-trivial (files, DB rows, migrations).
- Prefer simple, boring solutions over clever ones — this is a small app for <5 people,
  not a platform.
- Don't launch the dev server and drive the UI (Playwright/chromium-cli, screenshots,
  etc.) unless asked — for a simple change, run the build/typecheck and hand it off for
  the user to try themselves; for a more in-depth or risky change, ask first whether they
  want you to test it or will verify it themselves, rather than testing automatically.

## What to avoid

- Don't install new packages without asking first.
- Don't run ad-hoc schema changes against Supabase directly (SQL editor, one-off
  `ALTER TABLE`s) — every schema change goes into a new `supabase/migrations/NNNN_*.sql`
  file so the migration history stays the source of truth.
- Never touch, print, or commit `.env*` files (all git-ignored except `.env*.example`,
  which must only ever contain empty placeholders — see `.env.local.example`).

## Github workflow

- Never commit or push automatically — only on explicit instruction, each time.
- Before pushing: check the diff for bugs and security risks (leaked secrets, RLS gaps,
  server-only keys accidentally reachable from client code) — see the review pass done
  before the tags/area/city commit as the template for this.
- When committing, summarize what changed and why in the commit message, not just what
  files touched.

## Setup checklist

1. Copy `.env.local.example` to `.env.local` and fill in Supabase + Google keys.
2. Run every file in `supabase/migrations/` against the Supabase project, in order
   (SQL editor or Supabase CLI).
3. In Google Cloud Console: enable Maps JavaScript API + Places API (New), create a Map ID
   for Advanced Markers (set it as `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`), restrict the two
   keys as described in `.env.local.example`.
4. Create each member's account from the Supabase dashboard (Auth → Users → Add user),
   and keep "Allow new users to sign up" disabled there — the in-app form is sign-in
   only, no invite system.
