export interface GeocodeResult {
  lat: number;
  lng: number;
}

// Reuses the existing "search to add" server route rather than a separate Geocoding
// API -- Places Text Search resolves free-form address text into coordinates just as
// well, and this way there's no new API to enable/key-restrict. Returns null when
// there's no confident top match, so the caller can keep the previous coordinates and
// flag the row for manual review instead of silently mis-pinning it.
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  if (!query.trim()) return null;

  const res = await fetch("/api/places/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const top = data.results?.[0];
  if (!top || typeof top.lat !== "number" || typeof top.lng !== "number") return null;
  return { lat: top.lat, lng: top.lng };
}
