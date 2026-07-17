"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  deleteRestaurants,
  patchRestaurant,
  setFavourite,
  updateRestaurantTags,
} from "@/lib/restaurants";
import { createTag, fetchTags, PHOSPHOR_ICON_MAP, tagColor, tagIcon, type Tag, type TagKind } from "@/lib/tags";
import { geocodeAddress } from "@/lib/geocode";
import { matchesQuery } from "@/lib/search";
import { useRestaurantUI } from "@/components/AppShell";
import { BottomSheet } from "@/components/BottomSheet";
import { Dropdown, dropdownTriggerClass } from "@/components/Dropdown";
import { ListFilters, matchesFilters, type FilterState } from "@/components/ListFilters";
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { DownloadSimple, MapPin, Plus, Trash } from "@phosphor-icons/react";
import { downloadCsv, restaurantsToCsv } from "@/lib/csv";
import type { Restaurant } from "@/lib/types";

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

const HIDEABLE_COLUMNS = COLUMNS.filter((col) => col.key !== "name");

const CHECKBOX_COLUMN_WIDTH = 48;
const MIN_COLUMN_WIDTH = 60;
const NON_RESIZABLE_COLUMNS = new Set<SheetColumn>(["fav"]);
const DEFAULT_COLUMN_WIDTHS: Record<SheetColumn, number> = {
  fav: 48,
  name: 180,
  tags: 160,
  area: 140,
  city: 100,
  address: 220,
  phone: 130,
  price: 90,
  notes: 220,
};

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
  const {
    openEdit,
    openAddInline,
    restaurants,
    removeRestaurantsCache,
    patchRestaurantCache,
    syncRestaurants,
    syncTags,
  } = useRestaurantUI();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [needsReview, setNeedsReview] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tagEditor, setTagEditor] = useState<TagEditorState | null>(null);
  const [draftName, setDraftName] = useState("");
  const [columnWidths, setColumnWidths] = useState<Record<SheetColumn, number>>(DEFAULT_COLUMN_WIDTHS);
  const [resizing, setResizing] = useState<{ column: SheetColumn; startX: number; startWidth: number } | null>(
    null
  );
  const [hiddenColumns, setHiddenColumns] = useState<Set<SheetColumn>>(new Set());
  const [autoFit, setAutoFit] = useState(false);

  function toggleColumnVisibility(key: SheetColumn) {
    setHiddenColumns((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function showAllColumns() {
    setHiddenColumns(new Set());
  }

  function hideAllColumns() {
    setHiddenColumns(new Set(HIDEABLE_COLUMNS.map((col) => col.key)));
  }

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const next = Math.max(MIN_COLUMN_WIDTH, resizing!.startWidth + (e.clientX - resizing!.startX));
      setColumnWidths((w) => ({ ...w, [resizing!.column]: next }));
    }
    function onUp() {
      setResizing(null);
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  function startResize(e: React.MouseEvent, column: SheetColumn) {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ column, startX: e.clientX, startWidth: columnWidths[column] });
  }

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

  const filtered = restaurants.filter((r) => matchesQuery(r, query) && matchesFilters(r, filters));
  const sorted = [...filtered].sort((a, b) => compareRestaurants(a, b, sortColumn, sortDir));
  const visibleColumns = COLUMNS.filter((col) => !hiddenColumns.has(col.key));
  const totalTableWidth =
    CHECKBOX_COLUMN_WIDTH + visibleColumns.reduce((sum, col) => sum + columnWidths[col.key], 0);
  // Auto-fit expresses every column as a % of totalTableWidth instead of a literal px
  // value, so the browser rescales all of them together (keeping their relative
  // proportions) whenever the window/container resizes -- no JS measurement needed.
  const colWidth = (px: number) => (autoFit ? `${(px / totalTableWidth) * 100}%` : px);

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
    await syncRestaurants();
    if (column === "tags" || column === "area") await syncTags();
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
    const anchorColIndex = visibleColumns.findIndex((c) => c.key === anchorColumn);
    let touchedTagColumns = false;

    for (let ri = 0; ri < rows.length; ri++) {
      const original = sorted[rowIndex + ri];
      if (!original) break;
      // A working copy reused across every cell in this row so that, e.g., a Tags edit
      // followed by an Area edit in the same paste sees the Tags change instead of the
      // pre-paste snapshot (see the mutation note in applyCellEdit's tags/area case).
      const workingRestaurant: Restaurant = { ...original, tags: [...original.tags], areas: [...original.areas] };
      const cells = rows[ri].split("\t");
      for (let ci = 0; ci < cells.length; ci++) {
        const targetColumn = visibleColumns[anchorColIndex + ci];
        if (!targetColumn) break;
        if (targetColumn.key === "tags" || targetColumn.key === "area") touchedTagColumns = true;
        await applyCellEdit(workingRestaurant, targetColumn.key, cells[ci]);
      }
    }

    await syncRestaurants();
    if (touchedTagColumns) await syncTags();
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteConfirmed() {
    const ids = [...selectedIds];
    await deleteRestaurants(ids);
    setSelectedIds(new Set());
    setConfirmingDelete(false);
    removeRestaurantsCache(ids);
  }

  function exportCsv() {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`restaurants-${date}.csv`, restaurantsToCsv(restaurants));
  }

  function goToPlace(restaurant: Restaurant) {
    router.push(`/?place=${restaurant.id}`);
  }

  function deleteFromContextMenu(restaurant: Restaurant) {
    setSelectedIds(new Set([restaurant.id]));
    setConfirmingDelete(true);
  }

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
    syncRestaurants();
    syncTags();
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
            {r.tags.length > 0 ? (
              r.tags.map((t, i) => {
                const Icon = PHOSPHOR_ICON_MAP[tagIcon(t)];
                return (
                  <span key={t.id}>
                    <span style={{ color: tagColor(t) }}>
                      {Icon && <Icon size={12} weight="bold" className="mr-0.5 inline-block align-[-2px]" />}
                      {t.name}
                    </span>
                    {i < r.tags.length - 1 && ", "}
                  </span>
                );
              })
            ) : (
              <span className="text-black/30 dark:text-white/30">Empty</span>
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
              <span className="text-black/30 dark:text-white/30">Empty</span>
            )}
          </button>
        );
      case "city":
        return (
          <span className="block px-3 py-2 text-black/50 dark:text-white/50">
            {r.city?.name ?? <span className="text-black/30 dark:text-white/30">Empty</span>}
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

  if (restaurants.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-black/50 dark:text-white/50">There are no places added.</p>
        <button
          onClick={() => openAddInline("", (saved) => patchRestaurantCache(saved))}
          className="rounded-full bg-[#bd5a1f] px-4 py-2 text-sm font-medium text-white"
        >
          Add a place
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-none p-4 pb-2">
        <div className="rounded-lg bg-black/5 px-3 py-2 dark:bg-white/10">
          <ListFilters
            value={filters}
            onChange={updateFilters}
            className="flex flex-col gap-2"
            trailing={
            <div className="flex flex-1 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Dropdown
                  trigger={({ open, toggle }) => (
                    <button type="button" onClick={toggle} className={dropdownTriggerClass}>
                      Columns{hiddenColumns.size > 0 ? ` (${hiddenColumns.size} hidden)` : ""}
                      <span className="text-black/40">{open ? "▲" : "▼"}</span>
                    </button>
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    {HIDEABLE_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 text-xs text-black/70 dark:text-white/70"
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.has(col.key)}
                          onChange={() => toggleColumnVisibility(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-2 text-xs dark:border-white/10">
                    <button
                      type="button"
                      onClick={showAllColumns}
                      className="text-black/50 underline dark:text-white/50"
                    >
                      Show all
                    </button>
                    <button
                      type="button"
                      onClick={hideAllColumns}
                      className="text-black/50 underline dark:text-white/50"
                    >
                      Hide all
                    </button>
                  </div>
                </Dropdown>
                <button
                  type="button"
                  onClick={() => setAutoFit((v) => !v)}
                  title="Keep column widths proportional when the window is resized"
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    autoFit
                      ? "border-[#bd5a1f] bg-[#bd5a1f] text-white"
                      : "border-black/10 text-black/70 dark:border-white/10 dark:text-white/70"
                  }`}
                >
                  Auto-fit
                </button>
                <button type="button" className={dropdownTriggerClass}>
                  Import
                </button>
                <button type="button" className={dropdownTriggerClass}>
                  Sync
                </button>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 text-sm">
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
                <button type="button" onClick={exportCsv} className={dropdownTriggerClass}>
                  <DownloadSimple size={14} weight="bold" className="mr-1 inline-block align-[-2px]" />
                  Export CSV
                </button>
              </div>
            </div>
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 pt-0">
        <table
          className="border-collapse text-sm"
          style={{ tableLayout: "fixed", width: autoFit ? "100%" : totalTableWidth }}
        >
          <colgroup>
            <col style={{ width: colWidth(CHECKBOX_COLUMN_WIDTH) }} />
            {visibleColumns.map((col) => (
              <col key={col.key} style={{ width: colWidth(columnWidths[col.key]) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="group border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="px-3 py-2" />
              {visibleColumns.map((col) => {
                const active = col.key === sortColumn;
              return (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`relative cursor-pointer select-none truncate px-3 py-2 hover:text-black/80 dark:hover:text-white/80 ${
                    active ? "text-black/80 dark:text-white/80" : ""
                  }`}
                >
                  {col.key === "fav" ? "" : col.label}
                  {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  {!NON_RESIZABLE_COLUMNS.has(col.key) && (
                    <div
                      onMouseDown={(e) => startResize(e, col.key)}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none bg-black/10 opacity-0 transition-opacity hover:bg-black/30 group-hover:opacity-100 dark:bg-white/10 dark:hover:bg-white/30 ${
                        resizing?.column === col.key ? "!opacity-100 !bg-black/30 dark:!bg-white/30" : ""
                      }`}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, rowIndex) => (
            <ContextMenu key={r.id}>
              <ContextMenuTrigger asChild>
                <tr className="border-b border-black/5 dark:border-white/5 hover:bg-black/[.02] dark:hover:bg-white/5">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  {visibleColumns.map((col) => (
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
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={() => goToPlace(r)}>
                  <MapPin size={16} />
                  View place on map
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => deleteFromContextMenu(r)}>
                  <Trash size={16} />
                  Delete place
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}

          <tr className="border-b border-black/5 dark:border-white/5">
            <td className="px-3 py-2" />
            {visibleColumns.map((col) =>
              col.key === "name" ? (
                <td key={col.key} className="p-0">
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
                        openAddInline(draftName, (saved) => {
                          setDraftName("");
                          patchRestaurantCache(saved);
                        })
                      }
                      aria-label="Add restaurant"
                      className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#bd5a1f] text-white"
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>
                </td>
              ) : (
                <td key={col.key} className="px-3 py-2" />
              )
            )}
          </tr>
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p className="p-6 text-center text-sm text-black/50 dark:text-white/50">
          No matches for that search.
        </p>
      )}
      </div>

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

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} restaurant{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
