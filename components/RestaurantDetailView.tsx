"use client";

import { tagColor } from "@/lib/tags";
import type { Restaurant } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatHours(restaurant: Restaurant): string {
  if (!restaurant.opening_hours || restaurant.opening_hours.length === 0) {
    return "Hours not set";
  }
  return restaurant.opening_hours
    .map((p) => {
      const open = `${pad(p.open.hour)}:${pad(p.open.minute)}`;
      const close = p.close ? `${pad(p.close.hour)}:${pad(p.close.minute)}` : "?";
      return `${DAYS[p.open.day]} ${open}–${close}`;
    })
    .join(", ");
}

export function RestaurantDetailView({
  restaurant,
  onEdit,
}: {
  restaurant: Restaurant;
  onEdit: () => void;
}) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`;

  return (
    <div className="flex flex-col gap-3 pr-6">
      <h2 className="text-lg font-semibold">{restaurant.name}</h2>

      <div className="flex flex-wrap gap-1.5">
        {restaurant.tags.map((t) => (
          <span
            key={t.id}
            className="rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: tagColor(t), color: tagColor(t) }}
          >
            {t.name}
            {t.id === restaurant.primary_tag_id ? " ★" : ""}
          </span>
        ))}
        {restaurant.areas.map((a) => (
          <span
            key={a.id}
            className="rounded-full border border-black/15 px-2.5 py-1 text-xs text-black/60 dark:border-white/15 dark:text-white/60"
          >
            {a.name}
          </span>
        ))}
        {restaurant.city && (
          <span className="rounded-full border border-black/15 px-2.5 py-1 text-xs text-black/60 dark:border-white/15 dark:text-white/60">
            {restaurant.city.name}
          </span>
        )}
      </div>

      {restaurant.price_level && (
        <p className="text-sm text-black/70 dark:text-white/70">{"$".repeat(restaurant.price_level)}</p>
      )}
      <p className="text-sm text-black/70 dark:text-white/70">{restaurant.address}</p>
      <p className="text-sm text-black/70 dark:text-white/70">{formatHours(restaurant)}</p>
      {restaurant.phone && (
        <p className="text-sm text-black/70 dark:text-white/70">{restaurant.phone}</p>
      )}
      {restaurant.website && (
        <a
          href={restaurant.website}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-[#bd5a1f] underline"
        >
          {restaurant.website}
        </a>
      )}
      {restaurant.notes && (
        <p className="text-sm italic text-black/60 dark:text-white/60">{restaurant.notes}</p>
      )}
      <div className="mt-2 flex gap-2">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-black py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Get directions
        </a>
        <button
          onClick={onEdit}
          className="rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/10"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
