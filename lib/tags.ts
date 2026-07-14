import { supabase } from "./supabase";

export type TagKind = "tag" | "area" | "city";

export interface Tag {
  id: string;
  kind: TagKind;
  name: string;
  color: string | null;
  icon: string | null;
  created_at: string;
}

// Rotating palette for auto-assigning a color to newly created tags (kind='tag' only --
// area/city rows don't need one, since pin color comes from primary_tag_id, not area/city).
// Matches the seed data in supabase/migrations/0001_init.sql -- new tags continue the
// rotation from wherever the existing tag count leaves off.
export const TAG_PALETTE = [
  "#3d6e63", // teal
  "#b6892c", // ochre
  "#7a4a6b", // plum
  "#4c5f8a", // dusty blue
  "#9c3f34", // brick
  "#5f7a3d", // moss
];

export async function fetchTags(kind: TagKind): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("kind", kind)
    .order("name", { ascending: true });

  if (error) throw error;
  return data as Tag[];
}

export async function createTag(kind: TagKind, name: string, icon?: string | null): Promise<Tag> {
  const color = kind === "tag" ? await nextPaletteColor() : null;
  const { data, error } = await supabase
    .from("tags")
    .insert({ kind, name, color, icon: kind === "tag" ? (icon ?? null) : null })
    .select()
    .single();

  if (error) throw error;
  return data as Tag;
}

async function nextPaletteColor(): Promise<string> {
  const { count } = await supabase
    .from("tags")
    .select("id", { count: "exact", head: true })
    .eq("kind", "tag");
  return TAG_PALETTE[(count ?? 0) % TAG_PALETTE.length];
}

export function tagColor(tag: Tag | null | undefined): string {
  return tag?.color ?? "#5c6355";
}

// Curated set of Phosphor icon names offered when creating a new tag (see
// TagPicker) -- kept as a fixed whitelist rather than free text so every tag
// icon is guaranteed to resolve to a real, food-appropriate glyph.
export const TAG_ICONS = [
  "ForkKnife",
  "Coffee",
  "Bread",
  "IceCream",
  "BowlFood",
  "Hamburger",
  "Pizza",
  "CookingPot",
  "Wine",
  "Cookie",
  "Fish",
  "BeerStein",
] as const;

export type TagIconName = (typeof TAG_ICONS)[number];

const DEFAULT_TAG_ICON: TagIconName = "ForkKnife";

export function tagIcon(tag: Tag | null | undefined): TagIconName {
  if (tag?.icon && (TAG_ICONS as readonly string[]).includes(tag.icon)) {
    return tag.icon as TagIconName;
  }
  return DEFAULT_TAG_ICON;
}

// Best-effort mapping from Google Places' `primaryType` to a tag *name* -- this only
// prefills the tag picker's search box (see AddRestaurantFlow/TagPicker), it never
// selects or creates a tag on its own. Matches against existing tags by name; if
// nothing matches, the user creates a new one or ignores the suggestion entirely.
const PLACE_TYPE_TO_TAG_NAME: Record<string, string> = {
  bakery: "Bakery",
  cafe: "Cafe",
  coffee_shop: "Cafe",
  dessert_shop: "Dessert",
  ice_cream_shop: "Dessert",
  restaurant: "Restaurant",
  fine_dining_restaurant: "Restaurant",
};

export function suggestTagName(primaryType: string | null): string | null {
  if (!primaryType) return null;
  return PLACE_TYPE_TO_TAG_NAME[primaryType] ?? null;
}
