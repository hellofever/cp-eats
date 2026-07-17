"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin, Trash } from "@phosphor-icons/react";
import { deleteRestaurants } from "@/lib/restaurants";
import { tagColor } from "@/lib/tags";
import { matchesQuery } from "@/lib/search";
import { useRestaurantUI } from "@/components/AppShell";
import { BottomSheet } from "@/components/BottomSheet";
import { ListFilters, matchesFilters, type FilterState } from "@/components/ListFilters";
import { DEFAULT_SORT, SORT_OPTIONS, groupByArea, isSortKey, sortRestaurants } from "@/lib/sort";
import type { Restaurant } from "@/lib/types";

function RestaurantRow({
  restaurant: r,
  onClick,
  onContextMenu,
}: {
  restaurant: Restaurant;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5 text-left dark:border-white/10"
    >
      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: tagColor(r.primaryTag) }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {r.is_favourite && <span className="text-[#bd5a1f]">★ </span>}
          {r.name}
        </span>
        <span className="block truncate text-xs text-black/50 dark:text-white/50">
          {[...r.areas.map((a) => a.name), ...r.tags.map((t) => t.name), r.website, r.notes]
            .filter(Boolean)
            .join(" · ") || r.address}
        </span>
      </span>
      <span className="text-black/40">›</span>
    </button>
  );
}

export default function ListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = searchParams.get("q") ?? "";
  const { openDetail, openAdd, restaurants, removeRestaurantsCache } = useRestaurantUI();
  const [contextMenu, setContextMenu] = useState<{ restaurant: Restaurant; x: number; y: number } | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<Restaurant | null>(null);

  function handleRowContextMenu(e: React.MouseEvent, restaurant: Restaurant) {
    e.preventDefault();
    setContextMenu({ restaurant, x: e.clientX, y: e.clientY });
  }

  function viewPlaceOnMap(restaurant: Restaurant) {
    setContextMenu(null);
    router.push(`/?place=${restaurant.id}`);
  }

  function deleteFromContextMenu(restaurant: Restaurant) {
    setContextMenu(null);
    setDeleteTarget(restaurant);
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    await deleteRestaurants([deleteTarget.id]);
    setDeleteTarget(null);
    removeRestaurantsCache([deleteTarget.id]);
  }

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const filters: FilterState = {
    tagIds: (searchParams.get("tags") ?? "").split(",").filter(Boolean),
    areaIds: (searchParams.get("areas") ?? "").split(",").filter(Boolean),
    favouritesOnly: searchParams.get("fav") === "1",
  };

  function updateFilters(next: FilterState) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tagIds.length > 0) params.set("tags", next.tagIds.join(","));
    else params.delete("tags");
    if (next.areaIds.length > 0) params.set("areas", next.areaIds.join(","));
    else params.delete("areas");
    if (next.favouritesOnly) params.set("fav", "1");
    else params.delete("fav");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const sortParam = searchParams.get("sort");
  const sort = isSortKey(sortParam) ? sortParam : DEFAULT_SORT;

  function updateSort(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_SORT) params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const matched = restaurants.filter((r) => matchesQuery(r, query) && matchesFilters(r, filters));
  const groupedByArea = sort === "area" ? groupByArea(matched) : null;
  const flat = groupedByArea ? null : sortRestaurants(matched, sort);

  if (restaurants.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-black/50 dark:text-white/50">There are no places added.</p>
        <button
          onClick={openAdd}
          className="rounded-full bg-[#bd5a1f] px-4 py-2 text-sm font-medium text-white"
        >
          Add a place
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mx-4 mt-4 mb-2 rounded-lg bg-black/5 px-3 py-2 dark:bg-white/10">
        <ListFilters
          value={filters}
          onChange={updateFilters}
          className="flex flex-col gap-2"
          trailing={
            <select
              value={sort}
              onChange={(e) => updateSort(e.target.value)}
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        />
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4 pt-0">
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-2">
          {groupedByArea
            ? groupedByArea.map((group, i) => (
                <div key={group.areaName} className="flex flex-col gap-2">
                  <h3
                    className={`px-1 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50 ${i === 0 ? "" : "pt-3"}`}
                  >
                    {group.areaName}
                  </h3>
                  {group.restaurants.map((r) => (
                    <RestaurantRow
                      key={r.id}
                      restaurant={r}
                      onClick={() => openDetail(r)}
                      onContextMenu={(e) => handleRowContextMenu(e, r)}
                    />
                  ))}
                </div>
              ))
            : flat!.map((r) => (
                <RestaurantRow
                  key={r.id}
                  restaurant={r}
                  onClick={() => openDetail(r)}
                  onContextMenu={(e) => handleRowContextMenu(e, r)}
                />
              ))}
          {matched.length === 0 && (
            <p className="p-6 text-center text-sm text-black/50 dark:text-white/50">
              No restaurants match your search/filters.
            </p>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-40 w-48 overflow-hidden rounded-lg border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-zinc-900"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => viewPlaceOnMap(contextMenu.restaurant)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/[.04] dark:hover:bg-white/5"
          >
            <MapPin size={16} />
            View place on map
          </button>
          <button
            type="button"
            onClick={() => deleteFromContextMenu(contextMenu.restaurant)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-black/[.04] dark:hover:bg-white/5"
          >
            <Trash size={16} />
            Delete place
          </button>
        </div>
      )}

      <BottomSheet open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <h2 className="mb-2 pr-6 text-lg font-semibold">Delete {deleteTarget?.name}?</h2>
        <p className="mb-4 text-sm text-black/60 dark:text-white/60">This can&apos;t be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setDeleteTarget(null)}
            className="flex-1 rounded-lg border border-black/10 py-2 text-sm dark:border-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirmed}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white"
          >
            Delete
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
