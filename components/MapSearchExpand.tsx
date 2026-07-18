"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MagnifyingGlass, X } from "@phosphor-icons/react";
import { matchesQuery } from "@/lib/search";
import { TagPicker } from "@/components/TagPicker";
import { RestaurantCardContent } from "@/components/RestaurantCardContent";
import { useRestaurantUI } from "@/components/AppShell";
import type { Restaurant } from "@/lib/types";

type FilterKind = "types" | "tags" | "areas";
interface SelectedChip {
  id: string;
  name: string;
  kind: FilterKind;
}

// Shared by the collapsed bar and the mobile overlay's top bar -- a rounded field that
// looks like a single search input but actually holds the active type/tag/area filters
// as removable chips ahead of the free-text query, so a filter picked in the panel below
// stays visible (and removable) without reopening the panel.
export function SearchField({
  value,
  onChange,
  onFocus,
  placeholder,
  chips = [],
  onRemoveChip = () => {},
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  chips?: SelectedChip[];
  onRemoveChip?: (kind: FilterKind, id: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full items-center gap-1.5 overflow-x-auto rounded-full border border-black/10 bg-black/[.03] py-1.5 pl-3 pr-3 focus-within:border-black/30 dark:border-white/10 dark:bg-white/[.06] dark:focus-within:border-white/30 ${className}`}
    >
      <MagnifyingGlass size={16} className="shrink-0 text-black/40 dark:text-white/40" />
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="flex shrink-0 items-center gap-1 rounded-full bg-black/[.08] py-0.5 pl-2 pr-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70"
        >
          {chip.name}
          <button
            type="button"
            onClick={() => onRemoveChip(chip.kind, chip.id)}
            aria-label={`Remove ${chip.name} filter`}
            className="rounded-full p-0.5 text-black/50 hover:text-black/80 dark:text-white/50 dark:hover:text-white/80"
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        type="search"
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-[4rem] flex-1 bg-transparent text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
      />
    </div>
  );
}

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
  const { types, tags, areas, restaurants } = useRestaurantUI();
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const typeIds = (searchParams.get("mapTypes") ?? "").split(",").filter(Boolean);
  const tagIds = (searchParams.get("mapTags") ?? "").split(",").filter(Boolean);
  const areaIds = (searchParams.get("mapAreas") ?? "").split(",").filter(Boolean);

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

  // Prefixed "map"-, distinct from List/Sheet's own ?types=/?tags=/?areas= -- all three
  // views now share one route/query-string (see app/page.tsx), and Map's filter
  // selection is deliberately independent of List's/Sheet's, same as before when they
  // were separate routes.
  const FILTER_PARAM_KEYS: Record<FilterKind, string> = {
    types: "mapTypes",
    tags: "mapTags",
    areas: "mapAreas",
  };

  function updateIds(key: FilterKind, ids: string[]) {
    const paramKey = FILTER_PARAM_KEYS[key];
    const params = new URLSearchParams(searchParams.toString());
    if (ids.length > 0) params.set(paramKey, ids.join(","));
    else params.delete(paramKey);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }

  function removeChip(kind: FilterKind, id: string) {
    if (kind === "types") updateIds("types", typeIds.filter((x) => x !== id));
    else if (kind === "tags") updateIds("tags", tagIds.filter((x) => x !== id));
    else updateIds("areas", areaIds.filter((x) => x !== id));
  }

  function goToResult(r: Restaurant) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("place", r.id);
    router.push(`/?${params.toString()}`);
    setValue("");
    close();
  }

  const results = value.trim() ? restaurants.filter((r) => matchesQuery(r, value)) : [];

  const activeCount = typeIds.length + tagIds.length + areaIds.length;
  const selectedChips: SelectedChip[] = [
    ...types.filter((t) => typeIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name, kind: "types" as const })),
    ...tags.filter((t) => tagIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name, kind: "tags" as const })),
    ...areas.filter((t) => areaIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name, kind: "areas" as const })),
  ];

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
        kind="type"
        label="Filter by type"
        multiple
        allowCreate={false}
        selectedIds={typeIds}
        onChange={(ids) => updateIds("types", ids)}
        resetLabel="Reset types"
      />
      <TagPicker
        kind="tags"
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
    <div ref={containerRef} className="relative w-full">
      <SearchField
        value={value}
        onChange={setValue}
        onFocus={open}
        placeholder="Search restaurants…"
        chips={selectedChips}
        onRemoveChip={removeChip}
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
            <div className="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
              <button
                onClick={close}
                aria-label="Close search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
              >
                <ArrowLeft size={18} />
              </button>
              <SearchField
                autoFocus
                value={value}
                onChange={setValue}
                placeholder="Search restaurants…"
                chips={selectedChips}
                onRemoveChip={removeChip}
                className="min-w-0 flex-1"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{panel}</div>
            {(value.trim() || activeCount > 0) && (
              <div className="border-t border-black/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-white/10">
                <button
                  onClick={close}
                  className="w-full rounded-full bg-[#bd5a1f] px-4 py-3 text-sm font-medium text-white"
                >
                  Search
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
