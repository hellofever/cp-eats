"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createTag,
  countTagUsage,
  deleteTag,
  PHOSPHOR_ICON_MAP,
  tagColor,
  tagIcon,
  TAG_ICONS,
  TAG_PALETTE,
  updateTag,
  type Tag,
  type TagKind,
} from "@/lib/tags";
import { useRestaurantUI } from "./AppShell";

// One list+add+delete section per taxonomy facet (Type/Tags/Area), used 3x by
// TagManager. Only `colorable` (Type) rows get the icon/color swatches -- Tags/Area
// carry neither in the schema (see lib/tags.ts).
export function TagManagerSection({
  kind,
  label,
  colorable = false,
}: {
  kind: TagKind;
  label: string;
  colorable?: boolean;
}) {
  const { types, tags, areas, patchTagCache, removeTagFromCache } = useRestaurantUI();
  const options = { type: types, tags, area: areas }[kind];

  const [expanded, setExpanded] = useState<{ id: string; field: "color" | "icon" } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);
  const [pendingDeleteCount, setPendingDeleteCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [createIcon, setCreateIcon] = useState<string>(TAG_ICONS[0]);
  const [createColor, setCreateColor] = useState<string>(TAG_PALETTE[0]);
  const [creating, setCreating] = useState(false);

  function toggleExpand(id: string, field: "color" | "icon") {
    setExpanded((prev) => (prev?.id === id && prev.field === field ? null : { id, field }));
  }

  async function handleColorPick(tag: Tag, color: string) {
    setExpanded(null);
    const updated = await updateTag(tag.id, { color });
    patchTagCache(updated);
  }

  async function handleIconPick(tag: Tag, icon: string) {
    setExpanded(null);
    const updated = await updateTag(tag.id, { icon });
    patchTagCache(updated);
  }

  async function requestDelete(tag: Tag) {
    setPendingDelete(tag);
    setPendingDeleteCount(null);
    const count = await countTagUsage(tag.id);
    setPendingDeleteCount(count);
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteTag(pendingDelete.id);
      removeTagFromCache(kind, pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  function resetCreateForm() {
    setCreateValue("");
    setCreateIcon(TAG_ICONS[0]);
    setCreateColor(TAG_PALETTE[0]);
  }

  async function handleCreate() {
    if (!createValue.trim()) return;
    setCreating(true);
    try {
      const tag = await createTag(
        kind,
        createValue.trim(),
        colorable ? createIcon : null,
        colorable ? createColor : null
      );
      patchTagCache(tag);
      resetCreateForm();
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-2 text-xs font-semibold tracking-wide text-black/40 uppercase dark:text-white/40">
        {label}
      </h3>

      <div className="flex flex-col">
        {options.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-black/40 dark:text-white/40">
            No {label.toLowerCase()} yet.
          </p>
        )}
        {options.map((tag) => {
          const Icon = PHOSPHOR_ICON_MAP[tagIcon(tag)];
          return (
            <div key={tag.id}>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[.02] dark:hover:bg-white/[.04]">
                {colorable && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(tag.id, "icon")}
                    aria-label={`Change ${tag.name} icon`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 dark:border-white/10"
                    style={{ color: tagColor(tag) }}
                  >
                    <Icon size={14} weight="bold" />
                  </button>
                )}
                {colorable && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(tag.id, "color")}
                    aria-label={`Change ${tag.name} color`}
                    className="h-5 w-5 shrink-0 rounded-full border border-black/10 dark:border-white/10"
                    style={{ background: tagColor(tag) }}
                  />
                )}
                <span className="flex-1 truncate text-sm">{tag.name}</span>
                <button
                  type="button"
                  onClick={() => requestDelete(tag)}
                  aria-label={`Delete ${tag.name}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-black/40 hover:bg-black/[.06] hover:text-black/70 dark:text-white/40 dark:hover:bg-white/[.1] dark:hover:text-white/70"
                >
                  <Trash size={14} weight="bold" />
                </button>
              </div>

              {expanded?.id === tag.id && expanded.field === "icon" && (
                <div className="flex flex-wrap gap-1.5 py-2 pr-2 pl-11">
                  {TAG_ICONS.map((iconName) => {
                    const OptionIcon = PHOSPHOR_ICON_MAP[iconName];
                    const active = tagIcon(tag) === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => handleIconPick(tag, iconName)}
                        aria-label={iconName}
                        aria-pressed={active}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                          active
                            ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                            : "border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
                        }`}
                      >
                        <OptionIcon size={16} weight="bold" />
                      </button>
                    );
                  })}
                </div>
              )}

              {expanded?.id === tag.id && expanded.field === "color" && (
                <div className="flex flex-wrap gap-1.5 py-2 pr-2 pl-11">
                  {TAG_PALETTE.map((color) => {
                    const active = tagColor(tag) === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleColorPick(tag, color)}
                        aria-label={color}
                        aria-pressed={active}
                        className={`h-7 w-7 rounded-full border-2 ${
                          active ? "border-black dark:border-white" : "border-transparent"
                        }`}
                        style={{ background: color }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showCreate && (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-fit rounded-full border border-dashed border-black/25 px-2.5 py-1 text-xs text-black/60 dark:border-white/25 dark:text-white/60"
        >
          + Add {label.toLowerCase()}
        </button>
      )}

      {showCreate && (
        <div className="flex flex-col gap-2 px-2">
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
                resetCreateForm();
              }}
              className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10"
            >
              Cancel
            </button>
          </div>

          {colorable && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {TAG_ICONS.map((iconName) => {
                  const OptionIcon = PHOSPHOR_ICON_MAP[iconName];
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
                      <OptionIcon size={16} weight="bold" />
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TAG_PALETTE.map((color) => {
                  const active = createColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCreateColor(color)}
                      aria-label={color}
                      aria-pressed={active}
                      className={`h-7 w-7 rounded-full border-2 ${
                        active ? "border-black dark:border-white" : "border-transparent"
                      }`}
                      style={{ background: color }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteCount === null
                ? "Checking usage…"
                : pendingDeleteCount === 0
                  ? "Not used by any restaurants."
                  : `Used by ${pendingDeleteCount} restaurant${pendingDeleteCount === 1 ? "" : "s"} — this removes it from all of them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed} disabled={deleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
