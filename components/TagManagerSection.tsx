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
  updateTag,
  type Tag,
  type TagKind,
} from "@/lib/tags";
import { swatchColor, TYPE_HUES, type TypeHue } from "@/lib/colorTokens";
import { useOptimisticSave } from "@/lib/useOptimisticSave";
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
  const { run, isPending, isError } = useOptimisticSave();

  const [expanded, setExpanded] = useState<{ id: string; field: "color" | "icon" } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);
  const [pendingDeleteCount, setPendingDeleteCount] = useState<number | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [createIcon, setCreateIcon] = useState<string>(TAG_ICONS[0]);
  const [createColor, setCreateColor] = useState<TypeHue>(TYPE_HUES[0]);

  function toggleExpand(id: string, field: "color" | "icon") {
    setExpanded((prev) => (prev?.id === id && prev.field === field ? null : { id, field }));
  }

  function handleColorPick(tag: Tag, color: TypeHue) {
    setExpanded(null);
    run(`${tag.id}:color`, {
      apply: () => patchTagCache({ ...tag, color }),
      revert: () => patchTagCache(tag),
      write: () => updateTag(tag.id, { color }),
    });
  }

  function handleIconPick(tag: Tag, icon: string) {
    setExpanded(null);
    run(`${tag.id}:icon`, {
      apply: () => patchTagCache({ ...tag, icon }),
      revert: () => patchTagCache(tag),
      write: () => updateTag(tag.id, { icon }),
    });
  }

  function startEditName(tag: Tag) {
    setEditingId(tag.id);
    setEditValue(tag.name);
  }

  function commitEditName(tag: Tag, finalValue: string) {
    setEditingId(null);
    const trimmed = finalValue.trim();
    if (!trimmed || trimmed === tag.name) return;
    run(`${tag.id}:name`, {
      apply: () => patchTagCache({ ...tag, name: trimmed }),
      revert: () => patchTagCache(tag),
      write: () => updateTag(tag.id, { name: trimmed }),
    });
  }

  async function requestDelete(tag: Tag) {
    setPendingDelete(tag);
    setPendingDeleteCount(null);
    const count = await countTagUsage(tag.id);
    setPendingDeleteCount(count);
  }

  function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    const tag = pendingDelete;
    run(tag.id, {
      apply: () => removeTagFromCache(kind, tag.id),
      revert: () => patchTagCache(tag),
      write: () => deleteTag(tag.id),
      onSuccess: () => setPendingDelete(null),
    });
  }

  function resetCreateForm() {
    setCreateValue("");
    setCreateIcon(TAG_ICONS[0]);
    setCreateColor(TYPE_HUES[0]);
  }

  function handleCreate() {
    if (!createValue.trim()) return;
    const name = createValue.trim();
    const icon = colorable ? createIcon : null;
    const color = colorable ? createColor : null;
    run("create", {
      apply: () => {},
      revert: () => {},
      write: () => createTag(kind, name, icon, color),
      onSuccess: (tag) => {
        patchTagCache(tag);
        resetCreateForm();
        setShowCreate(false);
      },
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-2 text-xs tracking-wide text-black/40 uppercase dark:text-white/40">
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
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      isError(`${tag.id}:icon`)
                        ? "border-red-500 ring-2 ring-red-500"
                        : "border-black/10 dark:border-white/10"
                    }`}
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
                    className={`h-5 w-5 shrink-0 rounded-full border ${
                      isError(`${tag.id}:color`)
                        ? "border-red-500 ring-2 ring-red-500"
                        : "border-black/10 dark:border-white/10"
                    }`}
                    style={{ background: tagColor(tag) }}
                  />
                )}
                {editingId === tag.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEditName(tag, editValue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEditName(tag, editValue);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    className={`min-w-0 flex-1 rounded border bg-white px-1.5 py-0.5 text-sm outline-none dark:bg-black ${
                      isError(`${tag.id}:name`)
                        ? "border-red-500 ring-2 ring-red-500"
                        : "border-black/20 dark:border-white/20"
                    }`}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditName(tag)}
                    className={`min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-sm ${
                      isError(`${tag.id}:name`) ? "ring-2 ring-red-500" : ""
                    }`}
                  >
                    {tag.name}
                  </button>
                )}
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
                  {TYPE_HUES.map((hue) => {
                    const active = tag.color === hue;
                    return (
                      <button
                        key={hue}
                        type="button"
                        onClick={() => handleColorPick(tag, hue)}
                        aria-label={hue}
                        aria-pressed={active}
                        className={`h-7 w-7 rounded-full border-2 ${
                          active ? "border-black dark:border-white" : "border-transparent"
                        }`}
                        style={{ background: swatchColor(hue) }}
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
              disabled={isPending("create") || !createValue.trim()}
              className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isPending("create") ? "Adding…" : "Add"}
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
          {isError("create") && (
            <p className="text-sm text-red-600 dark:text-red-400">Something went wrong. Try again.</p>
          )}

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
                {TYPE_HUES.map((hue) => {
                  const active = createColor === hue;
                  return (
                    <button
                      key={hue}
                      type="button"
                      onClick={() => setCreateColor(hue)}
                      aria-label={hue}
                      aria-pressed={active}
                      className={`h-7 w-7 rounded-full border-2 ${
                        active ? "border-black dark:border-white" : "border-transparent"
                      }`}
                      style={{ background: swatchColor(hue) }}
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
          {pendingDelete && isError(pendingDelete.id) && (
            <p className="text-sm text-red-600 dark:text-red-400">Something went wrong. Try again.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={pendingDelete !== null && isPending(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
