"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { tagColor } from "@/lib/tags";
import { fetchRestaurants } from "@/lib/restaurants";
import { useRestaurantUI } from "./AppShell";
import type { Restaurant } from "@/lib/types";

export function MapView({ query }: { query: string }) {
  const { openDetail, refreshToken } = useRestaurantUI();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  useEffect(() => {
    fetchRestaurants().then(setRestaurants).catch(console.error);
  }, [refreshToken]);

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
        mapId="7a03f40461f9aed6ce58ae14"
        gestureHandling="greedy"
      >
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
