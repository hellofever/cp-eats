"use client";

import { Star } from "@phosphor-icons/react";

export function FavStar({
  active,
  onToggle,
  disabled,
}: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={active ? "Remove from favourites" : "Add to favourites"}
      className="flex w-full items-center justify-center py-2 disabled:opacity-50"
    >
      <Star
        size={18}
        weight={active ? "fill" : "regular"}
        className={active ? "text-red-500" : "text-black/30 dark:text-white/30"}
      />
    </button>
  );
}
