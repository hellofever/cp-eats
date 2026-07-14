"use client";

import { useEffect, useRef } from "react";
import { RestaurantCardContent } from "./RestaurantCardContent";
import type { Restaurant } from "@/lib/types";

// Experimental alternative to the drawer's restaurant panel -- floats over the map
// itself instead of living in the sidebar, so both can be compared side by side.
export function MapBottomCard({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!restaurant) return;
    // "pointerdown" (not "click") so this runs before a click on a different marker's
    // own onClick -- otherwise the two race and can leave a stale/no selection.
    function handlePointerDown(e: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [restaurant, onClose]);

  if (!restaurant) return null;

  return (
    <div
      ref={cardRef}
      className="absolute inset-x-4 bottom-4 z-10 mx-auto w-auto max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-900"
    >
      <RestaurantCardContent restaurant={restaurant} onClose={onClose} />
    </div>
  );
}
