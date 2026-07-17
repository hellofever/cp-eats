"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { matchesQuery } from "@/lib/search";
import { TagPicker } from "@/components/TagPicker";
import { RestaurantCardContent } from "@/components/RestaurantCardContent";
import { useRestaurantUI } from "@/components/AppShell";
import type { Restaurant } from "@/lib/types";

const searchInputClass =
  "w-full rounded-full border border-black/10 bg-black/[.03] px-4 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-white/[.06] dark:focus:border-white/30";

// Map view's search bar: on focus it expands into a panel showing tag/area toggles
// (the same TagPicker used on the edit form -- multi-select, a pill stays in place and
// just activates/deactivates, no separate "create new" affordance here) to filter the
// map, or (once typing) live restaurant results styled like the map's mini card.
// Picking a result routes through the same ?place=<id> param List/Sheet's "go to
// place" actions already use, so MapView's existing focusPlaceId/FocusOnPlace handling
// does the panning + mini-card work for free.
//
// The typed text is local-only, not synced to the shared ?q= param Header uses for
// List/Sheet -- search here is purely a "find and go to a place" tool, it never hides
// pins. tagIds/areaIds *do* live in the URL (?tags=/?areas=, same encoding List uses)
// since MapView needs them to filter pins and re-fit the map -- toggling uses
// router.replace (merged with whatever else is in the URL) so picking multiple tags in
// a row doesn't stack up browser-history entries or race any other navigation.
export function MapSearchExpand() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tags, areas, restaurants } = useRestaurantUI();
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const tagIds = (searchParams.get("tags") ?? "").split(",").filter(Boolean);
  const areaIds = (searchParams.get("areas") ?? "").split(",").filter(Boolean);

  function open() {
    setExpanded(true);
  }

  function close() {
    setExpanded(false);
  }

  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (overlayRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [expanded]);

  function updateIds(key: "tags" | "areas", ids: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (ids.length > 0) params.set(key, ids.join(","));
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }

  function goToResult(r: Restaurant) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("place", r.id);
    router.push(`/?${params.toString()}`);
    setValue("");
    close();
  }

  const results = value.trim() ? restaurants.filter((r) => matchesQuery(r, value)) : [];

  const activeCount = tagIds.length + areaIds.length;
  const summary =
    activeCount === 0
      ? null
      : activeCount === 1
        ? ([...tags, ...areas].find((t) => t.id === (tagIds[0] ?? areaIds[0]))?.name ?? null)
        : "Multiple tags selected";
  const placeholder = expanded ? "Search restaurants…" : (summary ?? "Search restaurants…");

  const panel = value.trim() ? (
    results.length > 0 ? (
      <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
        {results.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => goToResult(r)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") goToResult(r);
            }}
            className="cursor-pointer rounded-lg px-1 py-3 first:pt-0 last:pb-0 hover:bg-black/[.03] dark:hover:bg-white/[.05]"
          >
            <RestaurantCardContent restaurant={r} showActions={false} />
          </div>
        ))}
      </div>
    ) : (
      <p className="py-6 text-center text-sm text-black/50 dark:text-white/50">No matches</p>
    )
  ) : (
    <div className="flex flex-col gap-4">
      <TagPicker
        kind="tag"
        label="Filter by tag"
        multiple
        allowCreate={false}
        selectedIds={tagIds}
        onChange={(ids) => updateIds("tags", ids)}
        resetLabel="Reset tags"
      />
      <TagPicker
        kind="area"
        label="Filter by area"
        multiple
        allowCreate={false}
        selectedIds={areaIds}
        onChange={(ids) => updateIds("areas", ids)}
        resetLabel="Reset area"
      />
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <input
        type="search"
        value={value}
        onFocus={open}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={searchInputClass}
      />

      {expanded && (
        <div className="absolute left-1/2 top-full z-30 mt-1 hidden max-h-[60vh] w-[26rem] max-w-[90vw] -translate-x-1/2 overflow-y-auto rounded-lg border border-black/10 bg-white p-4 shadow-lg md:block dark:border-white/10 dark:bg-zinc-900">
          {panel}
        </div>
      )}

      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          // Portaled straight onto <body>: Header uses backdrop-blur, and per spec an
          // element with a backdrop-filter/filter becomes the containing block for any
          // position:fixed descendant -- so nested here, "fixed inset-0" would only
          // cover Header's own (header-bar-height) box, not the viewport, leaving the
          // map visible underneath and the panel squashed into a sliver.
          <div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] flex flex-col bg-white md:hidden dark:bg-black"
          >
            <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
              <button
                onClick={close}
                aria-label="Close search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
              >
                <ArrowLeft size={18} />
              </button>
              <input
                autoFocus
                type="search"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Search restaurants…"
                className={searchInputClass}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{panel}</div>
          </div>,
          document.body
        )}
    </div>
  );
}
