"use client";

import { useState } from "react";
import { NavigationArrow, ArrowsOut, MapPin, PencilSimple, Star, X } from "@phosphor-icons/react";
import { PHOSPHOR_ICON_MAP, tagColor, tagIcon } from "@/lib/tags";
import { setFavourite } from "@/lib/restaurants";
import { useRestaurantUI } from "./AppShell";
import type { Restaurant } from "@/lib/types";

export function RestaurantCardContent({
  restaurant,
  onClose,
  showActions = true,
}: {
  restaurant: Restaurant;
  onClose?: () => void;
  showActions?: boolean;
}) {
  const { openDetail, openEdit, patchRestaurantCache } = useRestaurantUI();
  const [favourite, setFavouriteState] = useState(restaurant.is_favourite);
  const [toggling, setToggling] = useState(false);

  const directionsUrl =
    restaurant.lat != null && restaurant.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`
      : null;

  async function handleToggleFavourite() {
    const next = !favourite;
    setFavouriteState(next);
    setToggling(true);
    try {
      await setFavourite(restaurant.id, next);
      patchRestaurantCache({ ...restaurant, is_favourite: next });
    } catch (err) {
      setFavouriteState(!next);
      console.error(err);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleFavourite();
          }}
          disabled={toggling}
          aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
          className="mt-0.5 shrink-0 disabled:opacity-50"
        >
          <Star
            size={16}
            weight={favourite ? "fill" : "regular"}
            className={favourite ? "text-red-500" : "text-black/30 dark:text-white/30"}
          />
        </button>
        <h3 className="min-w-0 flex-1 text-sm">{restaurant.name}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10 text-black/50 dark:border-white/10 dark:text-white/50"
          >
            <X size={12} weight="bold" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {restaurant.types.map((t) => {
          const Icon = PHOSPHOR_ICON_MAP[tagIcon(t)];
          return (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-white dark:text-black"
              style={{ background: tagColor(t), borderColor: tagColor(t) }}
            >
              {Icon && <Icon size={12} weight="fill" />}
              {t.name}
            </span>
          );
        })}
        {restaurant.tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-[11px] font-medium text-black/60 dark:border-white/15 dark:text-white/60"
          >
            {t.name}
          </span>
        ))}
        {restaurant.areas.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-[11px] font-medium text-black/60 dark:border-white/15 dark:text-white/60"
          >
            <MapPin size={12} weight="fill" />
            {a.name}
          </span>
        ))}
      </div>

      {restaurant.address && (
        <p className="text-xs text-black/60 dark:text-white/60">{restaurant.address}</p>
      )}

      {showActions && (
        <div className="flex gap-1.5">
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-black/10 py-1.5 dark:border-white/10"
            >
              <NavigationArrow size={16} weight="bold" />
              <span className="text-[11px]">Directions</span>
            </a>
          )}
          <button
            onClick={() => openDetail(restaurant)}
            className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-black/10 py-1.5 dark:border-white/10"
          >
            <ArrowsOut size={16} weight="bold" />
            <span className="text-[11px]">View more</span>
          </button>
          <button
            onClick={() => openEdit(restaurant)}
            className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-black/10 py-1.5 dark:border-white/10"
          >
            <PencilSimple size={16} weight="bold" />
            <span className="text-[11px]">Edit place</span>
          </button>
        </div>
      )}
    </div>
  );
}
