"use client";

import { RestaurantCardContent } from "./RestaurantCardContent";
import type { Restaurant } from "@/lib/types";

// Experimental alternative to the drawer's restaurant panel -- floats over the map
// itself instead of living in the sidebar, so both can be compared side by side.
// Dismissal on outside click is handled by the map's own onClick (see MapView) rather
// than a document-wide listener here, so clicking other UI (e.g. the drawer expander)
// doesn't clear the selection -- only clicking the map surface itself does.
//
// "floating" (desktop) is self-positioned and centered, same as the original design.
// "sheet" (mobile) is a plain flow element instead -- MapView lays it out as the last
// child of a bottom-anchored flex column shared with the locate button, so the card
// sliding in pushes the button up above it via ordinary reflow rather than manual
// height math.
export function MapBottomCard({
  restaurant,
  onClose,
  variant = "floating",
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
  variant?: "floating" | "sheet";
}) {
  if (!restaurant) return null;

  if (variant === "sheet") {
    return (
      <div className="w-full animate-in slide-in-from-bottom-10 fade-in duration-200">
        <div className="rounded-t-2xl bg-white p-4 shadow-xl dark:bg-zinc-900">
          <RestaurantCardContent restaurant={restaurant} onClose={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-4 bottom-4 z-10 mx-auto w-auto max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-900">
      <RestaurantCardContent restaurant={restaurant} onClose={onClose} />
    </div>
  );
}
