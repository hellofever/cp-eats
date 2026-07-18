"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CaretDown,
  CaretRight,
  CaretUp,
  ImageSquare,
  MapPin,
  Rows,
  SquaresFour,
  Star,
  Trash,
} from "@phosphor-icons/react";
import { deleteRestaurants } from "@/lib/restaurants";
import { fetchFirstPhotoUrls } from "@/lib/photos";
import { PHOSPHOR_ICON_MAP, tagColor, tagIcon, tagMapColor } from "@/lib/tags";
import { matchesQuery } from "@/lib/search";
import { useRestaurantUI } from "@/components/AppShell";
import { BottomSheet } from "@/components/BottomSheet";
import { Dropdown, dropdownTriggerClass } from "@/components/Dropdown";
import { ListFilters, matchesFilters, type FilterState } from "@/components/ListFilters";
import { DEFAULT_SORT, SORT_OPTIONS, groupByArea, isSortKey, sortRestaurants } from "@/lib/sort";
import type { Restaurant } from "@/lib/types";

type DisplayMode = "list" | "card";
const DEFAULT_DISPLAY: DisplayMode = "list";

function restaurantMeta(r: Restaurant): React.ReactNode {
  if (r.types.length === 0 && r.areas.length === 0 && r.tags.length === 0) return r.address;
  return (
    <>
      {r.types.length > 0 &&
        r.types.map((t, i) => (
          <span key={t.id} style={{ color: tagColor(t) }}>
            {i > 0 && ", "}
            {t.name}
          </span>
        ))}
      {r.areas.length > 0 && (
        <>
          {r.types.length > 0 && " · "}
          <MapPin size={12} weight="bold" className="mr-0.5 inline-block align-[-1px]" />
          {r.areas.map((a) => a.name).join(", ")}
        </>
      )}
      {r.tags.length > 0 && (
        <>
          {(r.types.length > 0 || r.areas.length > 0) && " · "}
          {r.tags.map((t) => t.name).join(", ")}
        </>
      )}
    </>
  );
}

function RestaurantRow({
  restaurant: r,
  onClick,
  onContextMenu,
}: {
  restaurant: Restaurant;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const Icon = PHOSPHOR_ICON_MAP[tagIcon(r.primaryTag)];
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5 text-left dark:border-white/10"
    >
      <span
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full"
        style={{ background: tagMapColor(r.primaryTag) }}
      >
        <Icon size={14} weight="bold" color="#ffffff" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">
          {r.is_favourite && (
            <Star size={14} weight="fill" className="mr-1 inline-block align-[-2px] text-[#bd5a1f]" />
          )}
          {r.name}
        </span>
        <span className="block truncate text-xs text-black/50 dark:text-white/50">
          {restaurantMeta(r)}
        </span>
      </span>
      <CaretRight size={18} className="flex-none text-black/40" />
    </button>
  );
}

function RestaurantCard({
  restaurant: r,
  photoUrl,
  onClick,
  onContextMenu,
}: {
  restaurant: Restaurant;
  photoUrl: string | undefined;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-black/10 text-left dark:border-white/10"
    >
      <div className="aspect-[4/3] w-full flex-none overflow-hidden bg-black/5 dark:bg-white/10">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageSquare size={28} weight="light" className="text-black/20 dark:text-white/20" />
          </div>
        )}
      </div>
      <span className="flex flex-col gap-1 p-3">
        <span className="line-clamp-1 text-sm font-bold">
          {r.is_favourite && (
            <Star size={14} weight="fill" className="mr-1 inline-block align-[-2px] text-[#bd5a1f]" />
          )}
          {r.name}
        </span>
        <span className="line-clamp-2 text-xs text-black/50 dark:text-white/50">{restaurantMeta(r)}</span>
      </span>
    </button>
  );
}

export function ListView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = searchParams.get("q") ?? "";
  const { openDetail, openAdd, restaurants, removeRestaurantsCache, lastPatchedRestaurant } =
    useRestaurantUI();
  const [contextMenu, setContextMenu] = useState<{ restaurant: Restaurant; x: number; y: number } | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<Restaurant | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());

  // Named listLayout, not view -- ?view= is now the top-level Map/List/Sheet switcher
  // (see app/page.tsx), a different param than this row-vs-card display toggle. They
  // collided when both were called "view": picking Card here set ?view=card, which
  // isn't a valid top-level view, so the switcher fell back to its Map default.
  const displayParam = searchParams.get("listLayout");
  const displayMode: DisplayMode = displayParam === "card" ? "card" : DEFAULT_DISPLAY;

  function updateDisplayMode(next: DisplayMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_DISPLAY) params.delete("listLayout");
    else params.set("listLayout", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Shared between the two effects below so a slow, now-superseded bulk fetch can never
  // overwrite the whole photoUrls map with stale/incomplete data -- matters because
  // Realtime can trigger the bulk fetch before a just-added restaurant's photo has
  // actually finished linking server-side (see AddRestaurantFlow.handleSave: insert ->
  // link photos -> onSaved). The targeted fetch below bumps this on dispatch so any
  // bulk fetch already in flight knows to discard its result when it lands; the
  // targeted fetch itself always applies (it only ever merges its one restaurant's
  // entry into whatever's there, which is safe regardless of ordering).
  const photoFetchSeq = useRef(0);

  const restaurantIdsKey = restaurants.map((r) => r.id).join(",");
  useEffect(() => {
    if (displayMode !== "card" || restaurants.length === 0) return;
    const seq = ++photoFetchSeq.current;
    fetchFirstPhotoUrls(restaurants.map((r) => r.id))
      .then((map) => {
        if (photoFetchSeq.current === seq) setPhotoUrls(map);
      })
      .catch((err) => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode, restaurantIdsKey]);

  // Runs on every add/edit/favourite-toggle (see patchRestaurantCache), not just when
  // the id set changes -- so a newly-added restaurant's photo (or a photo added to an
  // existing one) shows up immediately instead of only after a refresh.
  useEffect(() => {
    if (displayMode !== "card" || !lastPatchedRestaurant) return;
    const id = lastPatchedRestaurant.id;
    photoFetchSeq.current++;
    fetchFirstPhotoUrls([id])
      .then((map) => {
        setPhotoUrls((prev) => {
          const next = new Map(prev);
          const url = map.get(id);
          if (url) next.set(id, url);
          else next.delete(id);
          return next;
        });
      })
      .catch((err) => console.error(err));
  }, [displayMode, lastPatchedRestaurant]);

  function handleRowContextMenu(e: React.MouseEvent, restaurant: Restaurant) {
    e.preventDefault();
    setContextMenu({ restaurant, x: e.clientX, y: e.clientY });
  }

  function viewPlaceOnMap(restaurant: Restaurant) {
    setContextMenu(null);
    router.push(`/?view=map&place=${restaurant.id}`);
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
    typeIds: (searchParams.get("types") ?? "").split(",").filter(Boolean),
    tagIds: (searchParams.get("tags") ?? "").split(",").filter(Boolean),
    areaIds: (searchParams.get("areas") ?? "").split(",").filter(Boolean),
    favouritesOnly: searchParams.get("fav") === "1",
  };

  function updateFilters(next: FilterState) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.typeIds.length > 0) params.set("types", next.typeIds.join(","));
    else params.delete("types");
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
            <>
              <Dropdown
                key={sort}
                panelClassName="w-52"
                trigger={({ open, toggle }) => (
                  <button type="button" onClick={toggle} className={dropdownTriggerClass}>
                    {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Sort"}
                    {open ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
                  </button>
                )}
              >
                <div className="flex flex-col gap-1">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => updateSort(o.value)}
                      className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
                        o.value === sort
                          ? "bg-black/[.04] font-medium dark:bg-white/[.08]"
                          : "hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Dropdown>
              <div className="ml-auto flex items-center overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => updateDisplayMode("list")}
                  aria-label="List display"
                  aria-pressed={displayMode === "list"}
                  className={`flex h-8 w-8 items-center justify-center ${
                    displayMode === "list"
                      ? "bg-black/[.06] dark:bg-white/[.12]"
                      : "hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                  }`}
                >
                  <Rows size={14} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => updateDisplayMode("card")}
                  aria-label="Card display"
                  aria-pressed={displayMode === "card"}
                  className={`flex h-8 w-8 items-center justify-center ${
                    displayMode === "card"
                      ? "bg-black/[.06] dark:bg-white/[.12]"
                      : "hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                  }`}
                >
                  <SquaresFour size={14} weight="bold" />
                </button>
              </div>
            </>
          }
        />
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4 pt-0">
        <div
          className={
            displayMode === "card"
              ? "mx-auto grid w-full max-w-[1920px] grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
              : "mx-auto flex w-full max-w-[800px] flex-col gap-2"
          }
        >
          {groupedByArea
            ? groupedByArea.map((group, i) => (
                <div
                  key={group.areaName}
                  className={
                    displayMode === "card" ? "col-span-full flex flex-col gap-4" : "flex flex-col gap-2"
                  }
                >
                  <h3
                    className={`px-1 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50 ${i === 0 ? "" : "pt-3"}`}
                  >
                    {group.areaName}
                  </h3>
                  {displayMode === "card" ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {group.restaurants.map((r) => (
                        <RestaurantCard
                          key={r.id}
                          restaurant={r}
                          photoUrl={photoUrls.get(r.id)}
                          onClick={() => openDetail(r)}
                          onContextMenu={(e) => handleRowContextMenu(e, r)}
                        />
                      ))}
                    </div>
                  ) : (
                    group.restaurants.map((r) => (
                      <RestaurantRow
                        key={r.id}
                        restaurant={r}
                        onClick={() => openDetail(r)}
                        onContextMenu={(e) => handleRowContextMenu(e, r)}
                      />
                    ))
                  )}
                </div>
              ))
            : flat!.map((r) =>
                displayMode === "card" ? (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    photoUrl={photoUrls.get(r.id)}
                    onClick={() => openDetail(r)}
                    onContextMenu={(e) => handleRowContextMenu(e, r)}
                  />
                ) : (
                  <RestaurantRow
                    key={r.id}
                    restaurant={r}
                    onClick={() => openDetail(r)}
                    onContextMenu={(e) => handleRowContextMenu(e, r)}
                  />
                )
              )}
          {matched.length === 0 && (
            <p
              className={
                displayMode === "card"
                  ? "col-span-full p-6 text-center text-sm text-black/50 dark:text-white/50"
                  : "p-6 text-center text-sm text-black/50 dark:text-white/50"
              }
            >
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
