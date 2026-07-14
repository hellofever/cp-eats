"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from "@vis.gl/react-google-maps";
import { tagColor } from "@/lib/tags";
import { fetchRestaurants } from "@/lib/restaurants";
import { useRestaurantUI } from "./AppShell";
import type { Restaurant } from "@/lib/types";

const FOCUS_ZOOM = 17;

// Imperatively pans/zooms once both the map instance and the target restaurant are
// ready -- can't just use a smarter defaultCenter/defaultZoom, since the restaurant
// list (and therefore which one matches focusPlaceId) loads asynchronously after the
// Map has already mounted at its default view.
function FocusOnPlace({ restaurant }: { restaurant: Restaurant | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !restaurant) return;
    map.panTo({ lat: restaurant.lat, lng: restaurant.lng });
    map.setZoom(FOCUS_ZOOM);
  }, [map, restaurant]);
  return null;
}

export function MapView({
  query,
  focusPlaceId,
}: {
  query: string;
  focusPlaceId?: string | null;
}) {
  const { openDetail, refreshToken } = useRestaurantUI();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  useEffect(() => {
    fetchRestaurants().then(setRestaurants).catch(console.error);
  }, [refreshToken]);

  const focusedRestaurant = focusPlaceId
    ? (restaurants.find((r) => r.id === focusPlaceId) ?? null)
    : null;

  const q = query.trim().toLowerCase();
  const filtered = restaurants.filter((r) => {
    if (!q) return true;
    const tagNames = [...r.tags, ...r.areas, ...(r.city ? [r.city] : [])].map((t) =>
      t.name.toLowerCase()
    );
    return (
      r.name.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      tagNames.some((n) => n.includes(q))
    );
  });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-black/50 dark:text-white/50">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local to render the map.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        className="flex-1"
        defaultCenter={{ lat: -33.8688, lng: 151.2093 }}
        defaultZoom={12}
        mapId="7a03f40461f9aed667a8cf4f"
        gestureHandling="greedy"
      >
        <FocusOnPlace restaurant={focusedRestaurant} />
        {filtered.map((r) => (
          <AdvancedMarker
            key={r.id}
            position={{ lat: r.lat, lng: r.lng }}
            onClick={() => openDetail(r)}
          >
            <Pin
              background={tagColor(r.primaryTag)}
              borderColor="#262b22"
              glyphColor="#262b22"
            />
          </AdvancedMarker>
        ))}
      </Map>
    </APIProvider>
  );
}
