"use client";

import { useState } from "react";
import { MapPin, Star } from "@phosphor-icons/react";
import { PHOSPHOR_ICON_MAP, tagColor, tagIcon } from "@/lib/tags";
import { setFavourite } from "@/lib/restaurants";
import { useRestaurantUI } from "./AppShell";
import { ModalHeader } from "./BottomSheet";
import type { OpeningPeriod, Restaurant } from "@/lib/types";

// Indexed by Google's day-of-week convention (0 = Sunday), but displayed Monday-first.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatClock(hour: number, minute: number): { display: string; meridiem: "am" | "pm" } {
  const meridiem = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 || 12;
  return { display: minute === 0 ? `${h12}` : `${h12}:${pad(minute)}`, meridiem };
}

// Drops a redundant meridiem when both ends of the range fall on the same side of
// noon/midnight (e.g. "5–10 pm"), and only shows it twice when they differ (e.g.
// "11 am–2 pm").
function formatRange(period: OpeningPeriod): string {
  const open = formatClock(period.open.hour, period.open.minute);
  if (!period.close) return `${open.display} ${open.meridiem}`;
  const close = formatClock(period.close.hour, period.close.minute);
  return open.meridiem === close.meridiem
    ? `${open.display}–${close.display} ${close.meridiem}`
    : `${open.display} ${open.meridiem}–${close.display} ${close.meridiem}`;
}

// One block per day, Monday first -- a day with no period at all (Places omits closed
// days entirely rather than marking them) has an empty ranges array, rendered as
// "Closed"; a day with multiple periods (e.g. split lunch/dinner) gets one line each.
function hoursByDay(periods: OpeningPeriod[]): { day: string; ranges: string[] }[] {
  return DISPLAY_ORDER.map((dayIndex) => ({
    day: DAY_NAMES[dayIndex],
    ranges: periods.filter((p) => p.open.day === dayIndex).map(formatRange),
  }));
}

export function RestaurantDetailView({
  restaurant,
  onEdit,
  onClose,
}: {
  restaurant: Restaurant;
  onEdit: () => void;
  onClose: () => void;
}) {
  const directionsUrl =
    restaurant.lat != null && restaurant.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`
      : null;
  // Only link out to http(s) URLs -- website is freeform user text (form or Sheet
  // paste), so anything else (e.g. a javascript: URL) renders as plain text instead.
  const websiteHref =
    restaurant.website && /^https?:\/\//i.test(restaurant.website.trim())
      ? restaurant.website.trim()
      : null;
  const { patchRestaurantCache } = useRestaurantUI();
  const [favourite, setFavouriteState] = useState(restaurant.is_favourite);
  const [toggling, setToggling] = useState(false);

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
      <ModalHeader
        title={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleFavourite}
              disabled={toggling}
              aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
              className="shrink-0 disabled:opacity-50"
            >
              <Star
                size={18}
                weight={favourite ? "fill" : "regular"}
                className={favourite ? "text-red-500" : "text-black/30 dark:text-white/30"}
              />
            </button>
            <h2 className="min-w-0 truncate text-lg">{restaurant.name}</h2>
          </div>
        }
        onClose={onClose}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {restaurant.types.map((t) => {
          const Icon = PHOSPHOR_ICON_MAP[tagIcon(t)];
          return (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-white dark:text-black"
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
            className="inline-flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium text-black/60 dark:border-white/15 dark:text-white/60"
          >
            {t.name}
          </span>
        ))}
        {restaurant.areas.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium text-black/60 dark:border-white/15 dark:text-white/60"
          >
            <MapPin size={12} weight="fill" />
            {a.name}
          </span>
        ))}
      </div>

      {restaurant.price_level && (
        <p className="text-sm text-black/70 dark:text-white/70">{"$".repeat(restaurant.price_level)}</p>
      )}
      {restaurant.address && (
        <p className="text-sm text-black/70 dark:text-white/70">{restaurant.address}</p>
      )}

      {restaurant.opening_hours && restaurant.opening_hours.length > 0 ? (
        <div className="flex flex-col gap-0.5 text-sm">
          {hoursByDay(restaurant.opening_hours).map(({ day, ranges }) => (
            <div key={day} className="flex justify-between gap-4">
              <span>{day}</span>
              <span
                className={
                  ranges.length > 0
                    ? "text-black/70 dark:text-white/70"
                    : "text-black/40 dark:text-white/40"
                }
              >
                {ranges.length > 0 ? ranges.join(", ") : "Closed"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-black/70 dark:text-white/70">Hours not set</p>
      )}
      {restaurant.phone && (
        <p className="text-sm text-black/70 dark:text-white/70">{restaurant.phone}</p>
      )}
      {websiteHref ? (
        <a
          href={websiteHref}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-red-500 underline"
        >
          {websiteHref}
        </a>
      ) : (
        restaurant.website && (
          <p className="truncate text-sm text-black/70 dark:text-white/70">{restaurant.website}</p>
        )
      )}
      {restaurant.notes && (
        <p className="text-sm italic text-black/60 dark:text-white/60">{restaurant.notes}</p>
      )}
      <div className="mt-2 flex gap-2">
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg bg-black py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Get directions
          </a>
        )}
        <button
          onClick={onEdit}
          className={`rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/10 ${
            directionsUrl ? "" : "flex-1"
          }`}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
