"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  deleteRestaurants,
  fetchRestaurants,
  patchRestaurant,
  setFavourite,
  updateRestaurantTags,
} from "@/lib/restaurants";
import { createTag, fetchTags, type Tag, type TagKind } from "@/lib/tags";
import { geocodeAddress } from "@/lib/geocode";
import { useRestaurantUI } from "@/components/AppShell";
import { BottomSheet } from "@/components/BottomSheet";
import { TagPicker } from "@/components/TagPicker";
import { EditableTextCell } from "@/components/sheet/EditableTextCell";
import { AddressCell } from "@/components/sheet/AddressCell";
import { PriceCell } from "@/components/sheet/PriceCell";
import { FavStar } from "@/components/sheet/FavStar";
import {
  compareRestaurants,
  isSheetColumn,
  parsePriceLevel,
  type SheetColumn,
  type SortDirection,
} from "@/lib/sheetSort";
import { MapPin, Plus, Trash } from "@phosphor-icons/react";
import type { Restaurant } from "@/lib/types";

function matches(r: Restaurant, q: string): boolean {
  if (!q) return true;
  const tagNames = [...r.tags, ...r.areas, ...(r.city ? [r.city] : [])].map((t) =>
    t.name.toLowerCase()
  );
  return (
    r.name.toLowerCase().includes(q) ||
    r.address.toLowerCase().includes(q) ||
    tagNames.some((n) => n.includes(q))
  );
}

const COLUMNS: { key: SheetColumn; label: string }[] = [
  { key: "fav", label: "Fav" },
  { key: "name", label: "Name" },
  { key: "tags", label: "Tags" },
  { key: "area", label: "Area" },
  { key: "city", label: "City" },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "price", label: "Price" },
  { key: "notes", label: "Notes" },
];

interface TagEditorState {
  restaurant: Restaurant;
  kind: Extract<TagKind, "tag" | "area">;
  selectedIds: string[];
}

export default function SheetPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = searchParams.get("q") ?? "";
  const { openEdit, openAddInline, refreshToken, refresh } = useRestaurantUI();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [needsReview, setNeedsReview] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tagEditor, setTagEditor] = useState<TagEditorState | null>(null);
  const [draftName, setDraftName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ restaurant: Restaurant; x: number; y: number } | null>(
    null
  );

  const sortParam = searchParams.get("sheetSort");
  const sortColumn: SheetColumn = isSheetColumn(sortParam) ? sortParam : "name";
  const sortDir: SortDirection = searchParams.get("sheetDir") === "desc" ? "desc" : "asc";

  function toggleSort(column: SheetColumn) {
    const params = new URLSearchParams(searchParams.toString());
    const nextDir: SortDirection =
      column === sortColumn ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    params.set("sheetSort", column);
    params.set("sheetDir", nextDir);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  async function reload() {
    const data = await fetchRestaurants();
    setRestaurants(data);
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [refreshToken]);

  const q = query.trim().toLowerCase();
  const filtered = restaurants.filter((r) => matches(r, q));
  const sorted = [...filtered].sort((a, b) => compareRestaurants(a, b, sortColumn, sortDir));

  // Applies one cell edit without reloading/refreshing -- used directly by paste so a
  // multi-cell paste only triggers a single reload at the end, not one per cell.
  async function applyCellEdit(restaurant: Restaurant, column: SheetColumn, raw: string) {
    const value = raw.trim();
    try {
      switch (column) {
        case "name":
          if (value) await patchRestaurant(restaurant.id, { name: value });
          break;
        case "phone":
          await patchRestaurant(restaurant.id, { phone: value || null });
          break;
        case "notes":
          await patchRestaurant(restaurant.id, { notes: value || null });
          break;
        case "price":
          await patchRestaurant(restaurant.id, { price_level: parsePriceLevel(value) });
          break;
        case "fav": {
          const truthy = /^(true|1|yes|y|★|x)$/i.test(value);
          await setFavourite(restaurant.id, truthy);
          break;
        }
        case "address": {
          if (!value || value === restaurant.address) break;
          await patchRestaurant(restaurant.id, { address: value });
          const geo = await geocodeAddress(value);
          if (geo) {
            await patchRestaurant(restaurant.id, { lat: geo.lat, lng: geo.lng });
            setNeedsReview((s) => {
              if (!s.has(restaurant.id)) return s;
              const next = new Set(s);
              next.delete(restaurant.id);
              return next;
            });
          } else {
            setNeedsReview((s) => new Set(s).add(restaurant.id));
          }
          break;
        }
        case "tags":
        case "area": {
          const kind: TagKind = column === "tags" ? "tag" : "area";
          const names = value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const existing = await fetchTags(kind);
          const resolved: Tag[] = [];
          for (const name of names) {
            const match = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
            resolved.push(match ?? (await createTag(kind, name)));
          }
          const otherIds =
            column === "tags"
              ? [...restaurant.areas.map((a) => a.id), ...(restaurant.city ? [restaurant.city.id] : [])]
              : [...restaurant.tags.map((t) => t.id), ...(restaurant.city ? [restaurant.city.id] : [])];
          await updateRestaurantTags(restaurant.id, [...resolved.map((t) => t.id), ...otherIds]);
          // Mutate in place so a later cell in the same paste row (e.g. Area right after
          // Tags) sees this change instead of the pre-paste snapshot -- otherwise it
          // would recombine against stale ids and clobber what was just set.
          if (column === "tags") restaurant.tags = resolved;
          else restaurant.areas = resolved;
          break;
        }
        case "city":
          break; // read-only
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function commitCell(restaurant: Restaurant, column: SheetColumn, raw: string) {
    await applyCellEdit(restaurant, column, raw);
    await reload();
    refresh();
  }

  // Pasting starting from a text-input column (Name/Phone/Address/Price/Notes) cascades
  // rightward/downward across the visible columns and rows from that point, same as
  // pasting a block into a real spreadsheet. Fav/Tags/Area aren't real text inputs, so a
  // paste can't originate there, but they're still reachable as *targets* when the paste
  // block extends into them from an anchor further left. New rows are never created by
  // paste -- it stops at the last existing row.
  async function handlePasteGrid(rowIndex: number, anchorColumn: SheetColumn, text: string) {
    const rows = text
      .split(/\r\n|\n|\r/)
      .filter((line, i, arr) => !(i === arr.length - 1 && line === ""));
    const anchorColIndex = COLUMNS.findIndex((c) => c.key === anchorColumn);

    for (let ri = 0; ri < rows.length; ri++) {
      const original = sorted[rowIndex + ri];
      if (!original) break;
      // A working copy reused across every cell in this row so that, e.g., a Tags edit
      // followed by an Area edit in the same paste sees the Tags change instead of the
      // pre-paste snapshot (see the mutation note in applyCellEdit's tags/area case).
      const workingRestaurant: Restaurant = { ...original, tags: [...original.tags], areas: [...original.areas] };
      const cells = rows[ri].split("\t");
      for (let ci = 0; ci < cells.length; ci++) {
        const targetColumn = COLUMNS[anchorColIndex + ci];
        if (!targetColumn) break;
        await applyCellEdit(workingRestaurant, targetColumn.key, cells[ci]);
      }
    }

    await reload();
    refresh();
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((s) => (s.size === sorted.length ? new Set() : new Set(sorted.map((r) => r.id))));
  }

  async function handleDeleteConfirmed() {
    await deleteRestaurants([...selectedIds]);
    setSelectedIds(new Set());
    setConfirmingDelete(false);
    await reload();
    refresh();
  }

  function handleRowContextMenu(e: React.MouseEvent, restaurant: Restaurant) {
    e.preventDefault();
    setContextMenu({ restaurant, x: e.clientX, y: e.clientY });
  }

  function goToPlace(restaurant: Restaurant) {
    setContextMenu(null);
    router.push(`/?place=${restaurant.id}`);
  }

  function deleteFromContextMenu(restaurant: Restaurant) {
    setContextMenu(null);
    setSelectedIds(new Set([restaurant.id]));
    setConfirmingDelete(true);
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

  function openTagEditor(restaurant: Restaurant, kind: Extract<TagKind, "tag" | "area">) {
    setTagEditor({
      restaurant,
      kind,
      selectedIds: kind === "tag" ? restaurant.tags.map((t) => t.id) : restaurant.areas.map((a) => a.id),
    });
  }

  async function handleTagEditorChange(newIds: string[]) {
    if (!tagEditor) return;
    setTagEditor({ ...tagEditor, selectedIds: newIds });
    const other =
      tagEditor.kind === "tag"
        ? [
            ...tagEditor.restaurant.areas.map((a) => a.id),
            ...(tagEditor.restaurant.city ? [tagEditor.restaurant.city.id] : []),
          ]
        : [
            ...tagEditor.restaurant.tags.map((t) => t.id),
            ...(tagEditor.restaurant.city ? [tagEditor.restaurant.city.id] : []),
          ];
    await updateRestaurantTags(tagEditor.restaurant.id, [...newIds, ...other]);
  }

  function closeTagEditor() {
    setTagEditor(null);
    reload();
    refresh();
  }

  function renderCell(r: Restaurant, column: SheetColumn) {
    switch (column) {
      case "fav":
        return (
          <FavStar
            active={r.is_favourite}
            onToggle={() => commitCell(r, "fav", r.is_favourite ? "false" : "true")}
          />
        );
      case "name":
        return <EditableTextCell value={r.name} onCommit={(v) => commitCell(r, "name", v)} />;
      case "tags":
        return (
          <button
            type="button"
            onClick={() => openTagEditor(r, "tag")}
            className="block w-full truncate px-3 py-2 text-left"
          >
            {r.tags.map((t) => t.name).join(", ") || (
              <span className="text-black/30 dark:text-white/30">—</span>
            )}
          </button>
        );
      case "area":
        return (
          <button
            type="button"
            onClick={() => openTagEditor(r, "area")}
            className="block w-full truncate px-3 py-2 text-left"
          >
            {r.areas.map((a) => a.name).join(", ") || (
              <span className="text-black/30 dark:text-white/30">—</span>
            )}
          </button>
        );
      case "city":
        return (
          <span className="block px-3 py-2 text-black/50 dark:text-white/50">
            {r.city?.name ?? "—"}
          </span>
        );
      case "address":
        return (
          <AddressCell
            value={r.address}
            needsReview={needsReview.has(r.id)}
            onCommit={(v) => commitCell(r, "address", v)}
            onClickReview={() => openEdit(r)}
          />
        );
      case "phone":
        return <EditableTextCell value={r.phone ?? ""} onCommit={(v) => commitCell(r, "phone", v)} />;
      case "price":
        return (
          <PriceCell
            value={r.price_level}
            onCommit={(v) => commitCell(r, "price", v == null ? "" : String(v))}
          />
        );
      case "notes":
        return <EditableTextCell value={r.notes ?? ""} onCommit={(v) => commitCell(r, "notes", v)} />;
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (restaurants.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-black/50 dark:text-white/50">There are no places added.</p>
        <button
          onClick={() => openAddInline("", () => reload())}
          className="rounded-full bg-[#bd5a1f] px-4 py-2 text-sm font-medium text-white"
        >
          Add a place
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
          <span>{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Trash size={14} weight="bold" />
            Delete
          </button>
        </div>
      )}

      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/10 dark:text-white/50">
            <th className="px-3 py-2">
              <input
                type="checkbox"
                checked={sorted.length > 0 && selectedIds.size === sorted.length}
                onChange={toggleSelectAll}
              />
            </th>
            {COLUMNS.map((col) => {
              const active = col.key === sortColumn;
              return (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`cursor-pointer select-none px-3 py-2 hover:text-black/80 dark:hover:text-white/80 ${
                    active ? "text-black/80 dark:text-white/80" : ""
                  }`}
                >
                  {col.label}
                  {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, rowIndex) => (
            <tr
              key={r.id}
              onContextMenu={(e) => handleRowContextMenu(e, r)}
              className="border-b border-black/5 dark:border-white/5 hover:bg-black/[.02] dark:hover:bg-white/5"
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                />
              </td>
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  onPaste={(e) => {
                    e.preventDefault();
                    handlePasteGrid(rowIndex, col.key, e.clipboardData.getData("text"));
                  }}
                  className="p-0"
                >
                  {renderCell(r, col.key)}
                </td>
              ))}
            </tr>
          ))}

          <tr className="border-b border-black/5 dark:border-white/5">
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="p-0">
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="New restaurant…"
                  className="min-w-0 flex-1 border-b border-dashed border-black/20 bg-transparent py-1 text-sm outline-none dark:border-white/20"
                />
                <button
                  type="button"
                  onClick={() =>
                    openAddInline(draftName, () => {
                      setDraftName("");
                      reload();
                    })
                  }
                  aria-label="Add restaurant"
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#bd5a1f] text-white"
                >
                  <Plus size={14} weight="bold" />
                </button>
              </div>
            </td>
            <td colSpan={COLUMNS.length - 2} />
          </tr>
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p className="p-6 text-center text-sm text-black/50 dark:text-white/50">
          No matches for that search.
        </p>
      )}

      <BottomSheet open={tagEditor !== null} onClose={closeTagEditor}>
        {tagEditor && (
          <TagPicker
            kind={tagEditor.kind}
            label={tagEditor.kind === "tag" ? "Tags" : "Area"}
            multiple
            selectedIds={tagEditor.selectedIds}
            onChange={handleTagEditorChange}
          />
        )}
      </BottomSheet>

      <BottomSheet open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <h2 className="mb-2 pr-6 text-lg font-semibold">
          Delete {selectedIds.size} restaurant{selectedIds.size === 1 ? "" : "s"}?
        </h2>
        <p className="mb-4 text-sm text-black/60 dark:text-white/60">This can&apos;t be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmingDelete(false)}
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

      {contextMenu && (
        <div
          className="fixed z-40 w-48 overflow-hidden rounded-lg border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-zinc-900"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => goToPlace(contextMenu.restaurant)}
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
    </div>
  );
}
