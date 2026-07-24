import { supabase } from "./supabase";
import type { RestaurantPhoto } from "./types";

export const MAX_RESTAURANT_PHOTOS = 10;

const BUCKET = "restaurant-photos";
const SIGNED_URL_TTL_SECONDS = 3600;
// Refetch a bit before the signed URL actually expires, so a request in flight when the
// clock ticks over never gets handed an already-dead URL.
const REFRESH_BUFFER_SECONDS = 300;

// Module-scoped, keyed by storage_path (stable across restaurant/session), so every
// caller (ListView's grid, RestaurantDetailView's gallery, PhotoUploader) shares one
// signed URL per photo instead of each minting its own. Reusing the exact same URL
// string is what lets the browser's own HTTP cache actually hit -- a fresh token every
// call means a new cache key every call, which is what made images look "uncached."
const urlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedUrl(path: string): string | undefined {
  const hit = urlCache.get(path);
  return hit && hit.expiresAt > Date.now() ? hit.url : undefined;
}

function setCachedUrl(path: string, url: string) {
  urlCache.set(path, { url, expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - REFRESH_BUFFER_SECONDS) * 1000 });
}

export function invalidatePhotoUrlCache(path: string) {
  urlCache.delete(path);
}

async function signPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  for (const s of signed) {
    if (s.signedUrl && !s.error) setCachedUrl(s.path ?? "", s.signedUrl);
  }
}

// `force` bypasses the cache for the requested paths -- used to self-heal a photo whose
// cached URL failed to actually load (see FadeImage's onError), without discarding every
// other cached URL along with it.
export async function fetchRestaurantPhotos(
  restaurantId: string,
  opts?: { force?: boolean }
): Promise<(RestaurantPhoto & { url: string })[]> {
  const { data, error } = await supabase
    .from("restaurant_photos")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const photos = data as RestaurantPhoto[];
  const toSign = opts?.force
    ? photos.map((p) => p.storage_path)
    : photos.filter((p) => !getCachedUrl(p.storage_path)).map((p) => p.storage_path);
  await signPaths(toSign);

  return photos.flatMap((photo) => {
    const url = getCachedUrl(photo.storage_path);
    return url ? [{ ...photo, url }] : [];
  });
}

// Uploads to Storage only -- doesn't touch restaurant_photos. `folder` is the
// restaurant's id when it already exists (edit mode), or a client-generated
// placeholder id when it doesn't yet (add mode) -- the restaurant_photos row can only
// be created once the restaurant row exists (FK), so add-mode uploads sit unlinked in
// Storage until linkPendingPhotos runs at save time.
export async function uploadPhotoFile(folder: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

export async function linkPhotoToRestaurant(
  restaurantId: string,
  storagePath: string
): Promise<RestaurantPhoto> {
  const { data, error } = await supabase
    .from("restaurant_photos")
    .insert({ restaurant_id: restaurantId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw error;
  return data as RestaurantPhoto;
}

export async function linkPendingPhotos(restaurantId: string, storagePaths: string[]): Promise<void> {
  for (const path of storagePaths) {
    await linkPhotoToRestaurant(restaurantId, path);
  }
}

export async function deletePhotoObject(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
  invalidatePhotoUrlCache(storagePath);
}

// Batch version of fetchRestaurantPhotos for grids that just need a thumbnail per
// restaurant (List view's Card display) -- one query for the earliest photo row per
// restaurant plus one signed-URL batch call, instead of N round trips.
export async function fetchFirstPhotoUrls(
  restaurantIds: string[],
  opts?: { force?: boolean }
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (restaurantIds.length === 0) return result;

  const { data, error } = await supabase
    .from("restaurant_photos")
    .select("restaurant_id, storage_path, created_at")
    .in("restaurant_id", restaurantIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const firstPathByRestaurant = new Map<string, string>();
  for (const row of data as { restaurant_id: string; storage_path: string }[]) {
    if (!firstPathByRestaurant.has(row.restaurant_id)) {
      firstPathByRestaurant.set(row.restaurant_id, row.storage_path);
    }
  }
  if (firstPathByRestaurant.size === 0) return result;

  const paths = [...firstPathByRestaurant.values()];
  const toSign = opts?.force ? paths : paths.filter((p) => !getCachedUrl(p));
  await signPaths(toSign);

  for (const [restaurantId, path] of firstPathByRestaurant) {
    const url = getCachedUrl(path);
    if (url) result.set(restaurantId, url);
  }
  return result;
}

export async function deleteRestaurantPhoto(id: string): Promise<void> {
  const { data: photo, error: fetchError } = await supabase
    .from("restaurant_photos")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  await deletePhotoObject(photo.storage_path);

  const { error: deleteError } = await supabase.from("restaurant_photos").delete().eq("id", id);
  if (deleteError) throw deleteError;
}
