import { supabase } from "./supabase";
import type { Tag } from "./tags";
import type { Restaurant, RestaurantInput } from "./types";

const RESTAURANT_SELECT = `
  *,
  primary_tag:tags!restaurants_primary_tag_id_fkey(id, kind, name, color),
  restaurant_tags(tag:tags(id, kind, name, color))
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

async function syncRestaurantTags(restaurantId: string, tagIds: string[]) {
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

  await syncRestaurantTags(data.id, allTagIds);
  return fetchRestaurantById(data.id);
}

export async function updateRestaurant(id: string, input: RestaurantInput): Promise<Restaurant> {
  const { scalar, allTagIds } = splitInput(input);
  const { error } = await supabase.from("restaurants").update(scalar).eq("id", id);
  if (error) throw error;

  await syncRestaurantTags(id, allTagIds);
  return fetchRestaurantById(id);
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
