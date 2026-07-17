"use client";

import { useState } from "react";
import { TagPills } from "@/components/TagPills";
import { createTag, PHOSPHOR_ICON_MAP, TAG_ICONS, type TagKind } from "@/lib/tags";
import { useRestaurantUI } from "./AppShell";

// Shared multi/single-select for tags, area, and city -- all three are user-creatable,
// freeform lists stored the same way (see lib/tags.ts). Options render as a single row
// of click-to-toggle pills via TagPills, same as the Filters dropdown -- a pill stays in
// place and just activates/deactivates, it doesn't jump to a separate "selected" row.
// `multiple` just controls whether picking a new option replaces the current selection
// or adds to it; nothing at the data layer enforces single-select for city, it's purely
// a UI choice.
export function TagPicker({
  kind,
  label,
  multiple,
  selectedIds,
  onChange,
  initialQuery,
  allowCreate = true,
  resetLabel,
}: {
  kind: TagKind;
  label: string;
  multiple: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  initialQuery?: string;
  allowCreate?: boolean;
  resetLabel?: string;
}) {
  const { tags, areas, cities, patchTagCache } = useRestaurantUI();
  const options = kind === "tag" ? tags : kind === "area" ? areas : cities;
  const [showCreate, setShowCreate] = useState(!!initialQuery);
  const [createValue, setCreateValue] = useState(initialQuery ?? "");
  const [createIcon, setCreateIcon] = useState<string>(TAG_ICONS[0]);
  const [creating, setCreating] = useState(false);

  function toggle(id: string) {
    if (multiple) {
      onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    } else {
      onChange(selectedIds.includes(id) ? [] : [id]);
    }
  }

  async function handleCreate() {
    if (!createValue.trim()) return;
    setCreating(true);
    try {
      const tag = await createTag(kind, createValue.trim(), kind === "tag" ? createIcon : null);
      patchTagCache(tag);
      onChange(multiple ? [...selectedIds, tag.id] : [tag.id]);
      setCreateValue("");
      setCreateIcon(TAG_ICONS[0]);
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {resetLabel && selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-medium text-black/50 hover:text-black/80 dark:text-white/50 dark:hover:text-white/80"
          >
            {resetLabel}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <TagPills kind={kind} options={options} selectedIds={selectedIds} onToggle={toggle} />
        {allowCreate && !showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-full border border-dashed border-black/25 px-2.5 py-1 text-xs text-black/60 dark:border-white/25 dark:text-white/60"
          >
            + Add new {label.toLowerCase()}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              autoFocus
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              placeholder={`New ${label.toLowerCase()} name…`}
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !createValue.trim()}
              className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {creating ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateValue("");
                setCreateIcon(TAG_ICONS[0]);
              }}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10"
            >
              Cancel
            </button>
          </div>
          {kind === "tag" && (
            <div className="flex flex-wrap gap-1.5">
              {TAG_ICONS.map((iconName) => {
                const Icon = PHOSPHOR_ICON_MAP[iconName];
                const active = createIcon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setCreateIcon(iconName)}
                    aria-label={iconName}
                    aria-pressed={active}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                      active
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
                    }`}
                  >
                    <Icon size={16} weight="bold" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
