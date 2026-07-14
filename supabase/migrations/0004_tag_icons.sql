-- Per-tag marker icon (kind='tag' only, same rule as `color`) -- lets the map
-- render a distinct Phosphor icon per tag rather than just a color. Icon
-- values are Phosphor icon names, validated against a whitelist in
-- lib/tags.ts (not a DB constraint, since that list may grow over time).
alter table tags add column icon text;

update tags set icon = 'Bread'       where kind = 'tag' and name = 'Bakery';
update tags set icon = 'Coffee'      where kind = 'tag' and name = 'Cafe';
update tags set icon = 'BowlFood'    where kind = 'tag' and name = 'Casual Eats';
update tags set icon = 'ForkKnife'   where kind = 'tag' and name = 'Restaurant';
update tags set icon = 'IceCream'    where kind = 'tag' and name = 'Dessert';
