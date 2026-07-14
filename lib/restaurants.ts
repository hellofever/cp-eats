import { supabase } from "./supabase";
import type { Tag } from "./tags";
import type { Restaurant, RestaurantInput } from "./types";

const RESTAURANT_SELECT = `
  *,
  primary_tag:tags!restaurants_primary_tag_id_fkey(id, kind, name, color, icon),
  restaurant_tags(tag:tags(id, kind, name, color, icon))
`;

interface RawRestaurantRow {
  restaurant_tags?: { tag: Tag }[];
  primary_tag?: Tag | null;
  [key: string]: unknown;
}

function normalize(row: RawRestaurantRow): Restaurant {
  const allTags = (row.restaurant_tags ?? []).map((rt) => rt.tag);
  const { restaurant_tags: _restaurantTags, primary_tag, ...rest } = row;
  return {
    ...(rest as Omit<Restaurant, "primaryTag" | "tags" | "areas" | "city">),
    primaryTag: primary_tag ?? null,
    tags: allTags.filter((t) => t.kind === "tag"),
    areas: allTags.filter((t) => t.kind === "area"),
    city: allTags.find((t) => t.kind === "city") ?? null,
  };
}

export async function fetchRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as unknown as RawRestaurantRow[]).map(normalize);
}

export async function fetchRestaurantById(id: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    .eq("id", id)
    .single();

  if (error) throw error;
  return normalize(data as unknown as RawRestaurantRow);
}

// Full replace of a restaurant's tag/area/city join rows. Callers must pass the
// COMPLETE set of ids (tags+areas+city combined) -- there's one join table for all
// three kinds, so a partial list here would silently drop the other kinds. When only
// one kind is being edited (e.g. the Sheet's Tags cell), combine the new ids for that
// kind with the restaurant's existing ids for the other two before calling this.
export async function updateRestaurantTags(restaurantId: string, tagIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from("restaurant_tags")
    .delete()
    .eq("restaurant_id", restaurantId);
  if (deleteError) throw deleteError;

  if (tagIds.length === 0) return;

  const rows = tagIds.map((tag_id) => ({ restaurant_id: restaurantId, tag_id }));
  const { error: insertError } = await supabase.from("restaurant_tags").insert(rows);
  if (insertError) throw insertError;
}

function splitInput(input: RestaurantInput) {
  const { tagIds, areaIds, cityId, ...scalar } = input;
  const allTagIds = [...tagIds, ...areaIds, ...(cityId ? [cityId] : [])];
  return { scalar, allTagIds };
}

export async function insertRestaurant(input: RestaurantInput): Promise<Restaurant> {
  const { scalar, allTagIds } = splitInput(input);
  const { data, error } = await supabase.from("restaurants").insert(scalar).select().single();
  if (error) throw error;

  await updateRestaurantTags(data.id, allTagIds);
  return fetchRestaurantById(data.id);
}

export async function updateRestaurant(id: string, input: RestaurantInput): Promise<Restaurant> {
  const { scalar, allTagIds } = splitInput(input);
  const { error } = await supabase.from("restaurants").update(scalar).eq("id", id);
  if (error) throw error;

  await updateRestaurantTags(id, allTagIds);
  return fetchRestaurantById(id);
}

export async function setFavourite(id: string, value: boolean): Promise<void> {
  const { error } = await supabase.from("restaurants").update({ is_favourite: value }).eq("id", id);
  if (error) throw error;
}

// Direct scalar-field patch for inline Sheet-cell edits -- skips the tag-sync dance
// entirely since tags/areas/city aren't scalar columns.
export async function patchRestaurant(
  id: string,
  fields: Partial<
    Pick<
      RestaurantInput,
      "name" | "address" | "lat" | "lng" | "phone" | "website" | "price_level" | "notes"
    >
  >
): Promise<void> {
  const { error } = await supabase.from("restaurants").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteRestaurants(ids: string[]): Promise<void> {
  const { error } = await supabase.from("restaurants").delete().in("id", ids);
  if (error) throw error;
}

export async function findByPlaceId(placeId: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    .eq("google_place_id", placeId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalize(data as unknown as RawRestaurantRow) : null;
}
