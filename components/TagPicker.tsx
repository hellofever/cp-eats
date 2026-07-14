"use client";

import { useEffect, useState } from "react";
import * as PhosphorIcons from "@phosphor-icons/react";
import { createTag, fetchTags, tagColor, TAG_ICONS, type Tag, type TagKind } from "@/lib/tags";

// Icon components are looked up by name from TAG_ICONS (see lib/tags.ts) rather than
// imported individually, since the whitelist may grow -- PhosphorIcons is typed loosely
// here because @phosphor-icons/react's module namespace mixes icon components with
// other exports (e.g. IconContext) that don't share the icon component's props shape.
const PHOSPHOR_ICON_MAP = PhosphorIcons as unknown as Record<
  string,
  React.ComponentType<{ size?: number; weight?: string }>
>;

// Shared multi/single-select for tags, area, and city -- all three are user-creatable,
// freeform lists stored the same way (see lib/tags.ts). Available options render as
// click-to-add pills (no typing required); selected ones render below as click-to-remove
// pills. `multiple` just controls whether picking a new option replaces the current
// selection or adds to it; nothing at the data layer enforces single-select for city,
// it's purely a UI choice.
export function TagPicker({
  kind,
  label,
  multiple,
  selectedIds,
  onChange,
  initialQuery,
}: {
  kind: TagKind;
  label: string;
  multiple: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  initialQuery?: string;
}) {
  const [options, setOptions] = useState<Tag[]>([]);
  const [showCreate, setShowCreate] = useState(!!initialQuery);
  const [createValue, setCreateValue] = useState(initialQuery ?? "");
  const [createIcon, setCreateIcon] = useState<string>(TAG_ICONS[0]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTags(kind).then(setOptions).catch(console.error);
  }, [kind]);

  const selected = options.filter((o) => selectedIds.includes(o.id));
  const available = options.filter((o) => !selectedIds.includes(o.id));

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
      setOptions((o) => [...o, tag]);
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
      <span>{label}</span>

      <div className="flex flex-wrap gap-1.5">
        {available.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{ borderColor: tagColor(t), color: tagColor(t) }}
          >
            + {t.name}
          </button>
        ))}
        {!showCreate && (
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

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-white"
              style={{ background: tagColor(t), borderColor: tagColor(t) }}
            >
              {t.name} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
