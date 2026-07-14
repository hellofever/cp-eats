"use client";

import { useEffect, useState } from "react";
import { Dropdown, dropdownTriggerClass } from "@/components/Dropdown";
import { TagPills } from "@/components/TagPills";
import { fetchTags, type Tag } from "@/lib/tags";

export interface FilterState {
  tagIds: string[];
  areaIds: string[];
  favouritesOnly: boolean;
}

export const EMPTY_FILTERS: FilterState = { tagIds: [], areaIds: [], favouritesOnly: false };

export function matchesFilters(
  r: { tags: Tag[]; areas: Tag[]; is_favourite: boolean },
  filters: FilterState
): boolean {
  if (filters.favouritesOnly && !r.is_favourite) return false;
  if (filters.tagIds.length > 0 && !r.tags.some((t) => filters.tagIds.includes(t.id))) return false;
  if (filters.areaIds.length > 0 && !r.areas.some((a) => filters.areaIds.includes(a.id))) return false;
  return true;
}

// Collapsible filter row for the List view: tags/area are click-to-toggle pills (OR
// within a facet, AND across facets -- see matchesFilters), plus a favourites-only
// toggle. State is owned by the caller and mirrored into the URL (see app/list/page.tsx)
// so it survives navigation the same way the search query does.
export function ListFilters({
  value,
  onChange,
  trailing,
  className = "flex flex-col gap-2 px-4 pt-3",
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [areas, setAreas] = useState<Tag[]>([]);

  useEffect(() => {
    fetchTags("tag").then(setTags).catch(console.error);
    fetchTags("area").then(setAreas).catch(console.error);
  }, []);

  const activeCount = value.tagIds.length + value.areaIds.length + (value.favouritesOnly ? 1 : 0);

  function toggleTag(id: string) {
    onChange({
      ...value,
      tagIds: value.tagIds.includes(id)
        ? value.tagIds.filter((x) => x !== id)
        : [...value.tagIds, id],
    });
  }

  function toggleArea(id: string) {
    onChange({
      ...value,
      areaIds: value.areaIds.includes(id)
        ? value.areaIds.filter((x) => x !== id)
        : [...value.areaIds, id],
    });
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Dropdown
          panelClassName="w-72"
          trigger={({ open, toggle }) => (
            <button type="button" onClick={toggle} className={dropdownTriggerClass}>
              Filters{activeCount > 0 ? ` (${activeCount})` : ""}
              <span className="text-black/40">{open ? "▲" : "▼"}</span>
            </button>
          )}
        >
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => onChange({ ...value, favouritesOnly: !value.favouritesOnly })}
              className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${
                value.favouritesOnly
                  ? "border-[#bd5a1f] bg-[#bd5a1f] text-white"
                  : "border-black/15 text-black/70 dark:border-white/15 dark:text-white/70"
              }`}
            >
              ★ Favourites only
            </button>

            {tags.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-black/50 dark:text-white/50">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  <TagPills kind="tag" options={tags} selectedIds={value.tagIds} onToggle={toggleTag} />
                </div>
              </div>
            )}

            {areas.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-black/50 dark:text-white/50">Area</span>
                <div className="flex flex-wrap gap-1.5">
                  <TagPills kind="area" options={areas} selectedIds={value.areaIds} onToggle={toggleArea} />
                </div>
              </div>
            )}

            <div className="border-t border-black/10 pt-3 dark:border-white/10">
              <button
                type="button"
                disabled={activeCount === 0}
                onClick={() => onChange(EMPTY_FILTERS)}
                className="w-full rounded-md border border-black/15 px-2.5 py-1.5 text-xs font-medium text-black/70 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/70"
              >
                Reset all filters
              </button>
            </div>
          </div>
        </Dropdown>
        {trailing}
      </div>
    </div>
  );
}
