-- Unified taxonomy table: tags, areas, and cities all share the same shape
-- (freeform, user-creatable, optionally colored) -- only their `kind` and
-- multiplicity rules differ. Tags and areas are many-to-many with restaurants
-- (via restaurant_tags); city is stored the same way but the app only ever
-- lets you pick one per restaurant (enforced in the UI, not the schema).
create type tag_kind as enum ('tag', 'area', 'city');

create table tags (
  id         uuid primary key default gen_random_uuid(),
  kind       tag_kind not null,
  name       text not null,
  -- only meaningful for kind='tag' -- drives the map pin color. Auto-assigned
  -- from a rotating palette when a new tag is created; null for area/city rows.
  color      text,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create index tags_kind_idx on tags (kind);

create table restaurants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  -- must be a kind='tag' row -- enforced by the app (only tag-kind rows are
  -- offered as "primary tag" choices), not by a DB constraint.
  primary_tag_id  uuid references tags(id) on delete set null,
  lat             double precision not null,
  lng             double precision not null,
  address         text not null,
  phone           text,
  website         text,
  price_level     smallint check (price_level between 1 and 4),
  opening_hours   jsonb,
  google_place_id text unique,
  notes           text,
  photo_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index restaurants_geo_idx on restaurants (lat, lng);
create index restaurants_primary_tag_idx on restaurants (primary_tag_id);

create table restaurant_tags (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  tag_id        uuid not null references tags(id) on delete cascade,
  primary key (restaurant_id, tag_id)
);

create index restaurant_tags_tag_idx on restaurant_tags (tag_id);

-- keep updated_at current on every edit (spreadsheet inline edits, form saves, etc.)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger restaurants_set_updated_at
  before update on restaurants
  for each row
  execute function set_updated_at();

alter table tags enable row level security;
alter table restaurants enable row level security;
alter table restaurant_tags enable row level security;

-- Small trusted group behind email/password auth: every signed-in account
-- can read and write every row. No per-row ownership -- this is a shared list,
-- not a multi-tenant product.
create policy "authenticated read" on tags
  for select using (auth.role() = 'authenticated');
create policy "authenticated write" on tags
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated read" on restaurants
  for select using (auth.role() = 'authenticated');
create policy "authenticated write" on restaurants
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated read" on restaurant_tags
  for select using (auth.role() = 'authenticated');
create policy "authenticated write" on restaurant_tags
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed data: starting tags/areas/city. Colors cycle through the app's tag
-- palette (see lib/tags.ts) in creation order; new tags created later in the
-- app continue the rotation from where this leaves off.
insert into tags (kind, name, color) values
  ('tag', 'Bakery',      '#3d6e63'),
  ('tag', 'Cafe',        '#b6892c'),
  ('tag', 'Casual Eats', '#7a4a6b'),
  ('tag', 'Restaurant',  '#4c5f8a'),
  ('tag', 'Dessert',     '#9c3f34');

insert into tags (kind, name) values
  ('area', 'Inner West'),
  ('area', 'City'),
  ('area', 'Inner City'),
  ('area', 'East'),
  ('area', 'West'),
  ('area', 'South'),
  ('area', 'North'),
  ('area', 'Regional');

insert into tags (kind, name) values
  ('city', 'Sydney');
