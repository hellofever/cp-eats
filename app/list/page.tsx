"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchRestaurants } from "@/lib/restaurants";
import { tagColor } from "@/lib/tags";
import { useRestaurantUI } from "@/components/AppShell";
import type { Restaurant } from "@/lib/types";

function matches(r: Restaurant, q: string): boolean {
  if (!q) return true;
  const tagNames = [...r.tags, ...r.areas, ...(r.city ? [r.city] : [])].map((t) =>
    t.name.toLowerCase()
  );
  return (
    r.name.toLowerCase().includes(q) ||
    r.address.toLowerCase().includes(q) ||
    tagNames.some((n) => n.includes(q))
  );
}

export default function ListPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const { openDetail, refreshToken } = useRestaurantUI();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  useEffect(() => {
    fetchRestaurants().then(setRestaurants).catch(console.error);
  }, [refreshToken]);

  const q = query.trim().toLowerCase();
  const filtered = restaurants.filter((r) => matches(r, q));

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {filtered.map((r) => (
        <button
          key={r.id}
          onClick={() => openDetail(r)}
          className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5 text-left dark:border-white/10"
        >
          <span
            className="h-2 w-2 flex-none rounded-full"
            style={{ background: tagColor(r.primaryTag) }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{r.name}</span>
            <span className="block text-xs text-black/50 dark:text-white/50">
              {[...r.tags.map((t) => t.name), ...r.areas.map((a) => a.name)].join(" · ") ||
                r.address}
            </span>
          </span>
          <span className="text-black/40">›</span>
        </button>
      ))}
      {filtered.length === 0 && (
        <p className="p-6 text-center text-sm text-black/50 dark:text-white/50">
          No restaurants yet.
        </p>
      )}
    </div>
  );
}
