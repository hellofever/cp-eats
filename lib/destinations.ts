import { supabase } from "./supabase";

export interface Destination {
  id: string;
  name: string;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

// Ordered oldest-first so the original/default destination sorts first -- used both for
// the switcher's listing and as the fallback when the URL has no ?destination= param.
export async function fetchDestinations(): Promise<Destination[]> {
  const { data, error } = await supabase
    .from("destinations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Destination[];
}

export async function createDestination(input: {
  name: string;
  googlePlaceId: string;
  lat: number;
  lng: number;
}): Promise<Destination> {
  const { data, error } = await supabase
    .from("destinations")
    .insert({ name: input.name, google_place_id: input.googlePlaceId, lat: input.lat, lng: input.lng })
    .select()
    .single();

  if (error) throw error;
  return data as Destination;
}

export async function updateDestination(
  id: string,
  updates: Partial<Pick<Destination, "name" | "google_place_id" | "lat" | "lng">>
): Promise<Destination> {
  const { data, error } = await supabase
    .from("destinations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Destination;
}

// restaurants.destination_id is a NOT NULL FK with no ON DELETE clause (see
// 0010_destinations.sql), so this throws if any restaurant still references this
// destination -- callers should check/warn before letting the user confirm (see
// DestinationSettings).
export async function deleteDestination(id: string): Promise<void> {
  const { error } = await supabase.from("destinations").delete().eq("id", id);
  if (error) throw error;
}
