"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  deleteRestaurants,
  derivePrimaryTagId,
  patchRestaurant,
  setFavourite,
  updateRestaurantPrimaryTag,
  updateRestaurantTags,
} from "@/lib/restaurants";
import { createTag, fetchTags, PHOSPHOR_ICON_MAP, tagColor, tagIcon, type Tag, type TagKind } from "@/lib/tags";
import { geocodeAddress } from "@/lib/geocode";
import { matchesQuery } from "@/lib/search";
import { fetchSheetColumnPrefs, saveSheetColumnPrefs } from "@/lib/sheetPrefs";
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
  parseNullableFloat,
  parsePriceLevel,
  type SheetColumn,
  type SortDirection,
} from "@/lib/sheetSort";
import { CaretDown, CaretUp, DownloadSimple, MapPin, Plus, Trash } from "@phosphor-icons/react";
import { downloadCsv, restaurantsToCsv } from "@/lib/csv";
import type { Restaurant } from "@/lib/types";

// Default column order -- the user's own order (once loaded/saved via
// lib/sheetPrefs.ts) takes over from here, see the `columnOrder` state below.
const ALL_COLUMN_KEYS: SheetColumn[] = [
  "fav",
  "name",
  "type",
  "tags",
  "area",
  "address",
  "lat",
  "lng",
  "phone",
  "website",
  "price",
  "notes",
  "added",
  "updated",
];

const COLUMN_LABELS: Record<SheetColumn, string> = {
  fav: "Fav",
  name: "Name",
  type: "Type",
  tags: "Tags",
  area: "Area",
  address: "Address",
  lat: "Latitude",
  lng: "Longitude",
  phone: "Phone",
  website: "Website",
  price: "Price",
  notes: "Notes",
  added: "Date added",
  updated: "Last edited",
};

const CHECKBOX_COLUMN_WIDTH = 48;
const MIN_COLUMN_WIDTH = 60;
const NON_RESIZABLE_COLUMNS = new Set<SheetColumn>(["fav"]);
const DEFAULT_COLUMN_WIDTHS: Record<SheetColumn, number> = {
  fav: 48,
  name: 180,
  type: 150,
  tags: 150,
  area: 140,
  address: 220,
  lat: 110,
  lng: 110,
  phone: 130,
  website: 180,
  price: 90,
  notes: 220,
  added: 110,
  updated: 110,
};

// Tag/Area/Type editing in the Sheet mutates one facet at a time (via openTagEditor's
// BottomSheet picker, or a Tags/Type/Area cell paste) but restaurant_tags is one join
// table for all four kinds -- this collects the *other* three kinds' existing ids so a
// single-facet write via updateRestaurantTags doesn't silently drop them.
function otherFacetIds(restaurant: Restaurant, exclude: Extract<TagKind, "type" | "tags" | "area">): string[] {
  const facets: Record<Extract<TagKind, "type" | "tags" | "area">, Tag[]> = {
    type: restaurant.types,
    tags: restaurant.tags,
    area: restaurant.areas,
  };
  const ids: string[] = [];
  for (const kind of ["type", "tags", "area"] as const) {
    if (kind !== exclude) ids.push(...facets[kind].map((t) => t.id));
  }
  return ids;
}

interface TagEditorState {
  restaurant: Restaurant;
  kind: Extract<TagKind, "type" | "tags" | "area">;
  selectedIds: string[];
}

export function SheetView() {
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
  const [columnOrder, setColumnOrder] = useState<SheetColumn[]>(ALL_COLUMN_KEYS);
  const [columnWidths, setColumnWidths] = useState<Record<SheetColumn, number>>(DEFAULT_COLUMN_WIDTHS);
  const [resizing, setResizing] = useState<{ column: SheetColumn; startX: number; startWidth: number } | null>(
    null
  );
  const [hiddenColumns, setHiddenColumns] = useState<Set<SheetColumn>>(new Set());
  const [autoFit, setAutoFit] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<SheetColumn | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<SheetColumn | null>(null);

  // Loads the signed-in user's saved layout once on mount. Defensively filtered against
  // ALL_COLUMN_KEYS so a layout saved before a column existed (or after one's removed)
  // degrades gracefully instead of breaking -- unknown stored keys are dropped, known
  // keys missing from the stored order are appended at the end.
  useEffect(() => {
    let cancelled = false;
    fetchSheetColumnPrefs()
      .then((prefs) => {
        if (cancelled || !prefs) return;
        const known = new Set(ALL_COLUMN_KEYS);
        const storedOrder = prefs.columnOrder.filter((k) => known.has(k));
        const missing = ALL_COLUMN_KEYS.filter((k) => !storedOrder.includes(k));
        setColumnOrder([...storedOrder, ...missing]);
        setHiddenColumns(new Set(prefs.hiddenColumns.filter((k) => known.has(k))));
        setColumnWidths((w) => ({ ...w, ...prefs.columnWidths }));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  function persistPrefs(overrides: {
    columnOrder?: SheetColumn[];
    hiddenColumns?: Set<SheetColumn>;
    columnWidths?: Record<SheetColumn, number>;
  }) {
    saveSheetColumnPrefs({
      columnOrder: overrides.columnOrder ?? columnOrder,
      hiddenColumns: [...(overrides.hiddenColumns ?? hiddenColumns)],
      columnWidths: overrides.columnWidths ?? columnWidths,
    }).catch(console.error);
  }

  function toggleColumnVisibility(key: SheetColumn) {
    const next = new Set(hiddenColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHiddenColumns(next);
    persistPrefs({ hiddenColumns: next });
  }

  function showAllColumns() {
    setHiddenColumns(new Set());
    persistPrefs({ hiddenColumns: new Set() });
  }

  function hideAllColumns() {
    const next = new Set(hideableColumns.map((col) => col.key));
    setHiddenColumns(next);
    persistPrefs({ hiddenColumns: next });
  }

  function handleColumnDrop(targetKey: SheetColumn) {
    setDragOverColumn(null);
    if (!draggedColumn || draggedColumn === targetKey) {
      setDraggedColumn(null);
      return;
    }
    const next = columnOrder.filter((k) => k !== draggedColumn);
    next.splice(next.indexOf(targetKey), 0, draggedColumn);
    setColumnOrder(next);
    persistPrefs({ columnOrder: next });
    setDraggedColumn(null);
  }

  useEffect(() => {
    if (!resizing) return;
    // Mirrors columnWidths state so `onUp` can persist the final value without
    // reading (possibly stale) state right after the last setColumnWidths call.
    const latestWidths = { current: columnWidths };
    function onMove(e: MouseEvent) {
      const next = Math.max(MIN_COLUMN_WIDTH, resizing!.startWidth + (e.clientX - resizing!.startX));
      setColumnWidths((w) => {
        latestWidths.current = { ...w, [resizing!.column]: next };
        return latestWidths.current;
      });
    }
    function onUp() {
      setResizing(null);
      persistPrefs({ columnWidths: latestWidths.current });
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

  // Prefixed sheet*, same convention as sheetSort/sheetDir below -- List has its own
  // identically-shaped ?types=/?tags=/?areas=/?fav= (see ListView), and now that List
  // and Sheet share one route/query-string (see app/page.tsx), reusing those names here
  // would silently share filter and favourites-only state between the two views.
  const filters: FilterState = {
    typeIds: (searchParams.get("sheetTypes") ?? "").split(",").filter(Boolean),
    tagIds: (searchParams.get("sheetTags") ?? "").split(",").filter(Boolean),
    areaIds: (searchParams.get("sheetAreas") ?? "").split(",").filter(Boolean),
    favouritesOnly: searchParams.get("sheetFav") === "1",
  };

  function updateFilters(next: FilterState) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.typeIds.length > 0) params.set("sheetTypes", next.typeIds.join(","));
    else params.delete("sheetTypes");
    if (next.tagIds.length > 0) params.set("sheetTags", next.tagIds.join(","));
    else params.delete("sheetTags");
    if (next.areaIds.length > 0) params.set("sheetAreas", next.areaIds.join(","));
    else params.delete("sheetAreas");
    if (next.favouritesOnly) params.set("sheetFav", "1");
    else params.delete("sheetFav");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const filtered = restaurants.filter((r) => matchesQuery(r, query) && matchesFilters(r, filters));
  const sorted = [...filtered].sort((a, b) => compareRestaurants(a, b, sortColumn, sortDir));
  const orderedColumns = columnOrder.map((key) => ({ key, label: COLUMN_LABELS[key] }));
  const hideableColumns = orderedColumns.filter((col) => col.key !== "name");
  const visibleColumns = orderedColumns.filter((col) => !hiddenColumns.has(col.key));
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
        case "website":
          await patchRestaurant(restaurant.id, { website: value || null });
          break;
        case "lat":
          await patchRestaurant(restaurant.id, { lat: parseNullableFloat(value) });
          break;
        case "lng":
          await patchRestaurant(restaurant.id, { lng: parseNullableFloat(value) });
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
          if (value === (restaurant.address ?? "")) break;
          if (!value) {
            // Cleared to empty -- a valid "no location" state, not a failed-geocode one.
            await patchRestaurant(restaurant.id, { address: null, lat: null, lng: null });
            setNeedsReview((s) => {
              if (!s.has(restaurant.id)) return s;
              const next = new Set(s);
              next.delete(restaurant.id);
              return next;
            });
            break;
          }
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
        case "type":
        case "tags":
        case "area": {
          const kind = column;
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
          const otherIds = otherFacetIds(restaurant, kind);
          await updateRestaurantTags(restaurant.id, [...resolved.map((t) => t.id), ...otherIds]);
          if (kind === "type") {
            const nextPrimaryId = derivePrimaryTagId(restaurant.primaryTag?.id ?? null, resolved.map((t) => t.id));
            if (nextPrimaryId !== (restaurant.primaryTag?.id ?? null)) {
              await updateRestaurantPrimaryTag(restaurant.id, nextPrimaryId);
            }
          }
          // Mutate in place so a later cell in the same paste row (e.g. Area right after
          // Type) sees this change instead of the pre-paste snapshot -- otherwise it
          // would recombine against stale ids and clobber what was just set.
          if (kind === "type") restaurant.types = resolved;
          else if (kind === "tags") restaurant.tags = resolved;
          else restaurant.areas = resolved;
          break;
        }
        case "added":
        case "updated":
          break; // read-only
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function commitCell(restaurant: Restaurant, column: SheetColumn, raw: string) {
    await applyCellEdit(restaurant, column, raw);
    await syncRestaurants();
    if (column === "type" || column === "tags" || column === "area") await syncTags();
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
      // A working copy reused across every cell in this row so that, e.g., a Type edit
      // followed by an Area edit in the same paste sees the Type change instead of the
      // pre-paste snapshot (see the mutation note in applyCellEdit's type/tags/area case).
      const workingRestaurant: Restaurant = {
        ...original,
        types: [...original.types],
        tags: [...original.tags],
        areas: [...original.areas],
      };
      const cells = rows[ri].split("\t");
      for (let ci = 0; ci < cells.length; ci++) {
        const targetColumn = visibleColumns[anchorColIndex + ci];
        if (!targetColumn) break;
        if (targetColumn.key === "type" || targetColumn.key === "tags" || targetColumn.key === "area") {
          touchedTagColumns = true;
        }
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
    router.push(`/?view=map&place=${restaurant.id}`);
  }

  function deleteFromContextMenu(restaurant: Restaurant) {
    setSelectedIds(new Set([restaurant.id]));
    setConfirmingDelete(true);
  }

  function openTagEditor(restaurant: Restaurant, kind: Extract<TagKind, "type" | "tags" | "area">) {
    const idsByKind = { type: restaurant.types, tags: restaurant.tags, area: restaurant.areas };
    setTagEditor({ restaurant, kind, selectedIds: idsByKind[kind].map((t) => t.id) });
  }

  async function handleTagEditorChange(newIds: string[]) {
    if (!tagEditor) return;
    setTagEditor({ ...tagEditor, selectedIds: newIds });
    const other = otherFacetIds(tagEditor.restaurant, tagEditor.kind);
    await updateRestaurantTags(tagEditor.restaurant.id, [...newIds, ...other]);
    if (tagEditor.kind === "type") {
      const nextPrimaryId = derivePrimaryTagId(tagEditor.restaurant.primaryTag?.id ?? null, newIds);
      if (nextPrimaryId !== (tagEditor.restaurant.primaryTag?.id ?? null)) {
        await updateRestaurantPrimaryTag(tagEditor.restaurant.id, nextPrimaryId);
      }
    }
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
        return (
          <EditableTextCell value={r.name} onCommit={(v) => commitCell(r, "name", v)} className="font-bold" />
        );
      case "type":
        return (
          <button
            type="button"
            onClick={() => openTagEditor(r, "type")}
            className="block w-full truncate px-3 py-2 text-left"
          >
            {r.types.length > 0 ? (
              r.types.map((t, i) => {
                const Icon = PHOSPHOR_ICON_MAP[tagIcon(t)];
                return (
                  <span key={t.id}>
                    <span style={{ color: tagColor(t) }}>
                      {Icon && <Icon size={12} weight="bold" className="mr-0.5 inline-block align-[-2px]" />}
                      {t.name}
                    </span>
                    {i < r.types.length - 1 && ", "}
                  </span>
                );
              })
            ) : (
              <span className="text-black/30 dark:text-white/30">Empty</span>
            )}
          </button>
        );
      case "tags":
        return (
          <button
            type="button"
            onClick={() => openTagEditor(r, "tags")}
            className="block w-full truncate px-3 py-2 text-left"
          >
            {r.tags.map((t) => t.name).join(", ") || (
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
      case "address":
        return (
          <AddressCell
            value={r.address}
            needsReview={needsReview.has(r.id)}
            onCommit={(v) => commitCell(r, "address", v)}
            onClickReview={() => openEdit(r)}
          />
        );
      case "lat":
        return (
          <EditableTextCell
            value={r.lat != null ? String(r.lat) : ""}
            onCommit={(v) => commitCell(r, "lat", v)}
          />
        );
      case "lng":
        return (
          <EditableTextCell
            value={r.lng != null ? String(r.lng) : ""}
            onCommit={(v) => commitCell(r, "lng", v)}
          />
        );
      case "phone":
        return <EditableTextCell value={r.phone ?? ""} onCommit={(v) => commitCell(r, "phone", v)} />;
      case "website":
        return <EditableTextCell value={r.website ?? ""} onCommit={(v) => commitCell(r, "website", v)} />;
      case "price":
        return (
          <PriceCell
            value={r.price_level}
            onCommit={(v) => commitCell(r, "price", v == null ? "" : String(v))}
          />
        );
      case "notes":
        return <EditableTextCell value={r.notes ?? ""} onCommit={(v) => commitCell(r, "notes", v)} />;
      case "added":
        return (
          <span className="block w-full truncate px-3 py-2 text-black/50 dark:text-white/50">
            {new Date(r.created_at).toLocaleDateString()}
          </span>
        );
      case "updated":
        return (
          <span className="block w-full truncate px-3 py-2 text-black/50 dark:text-white/50">
            {new Date(r.updated_at).toLocaleDateString()}
          </span>
        );
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
                      {open ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
                    </button>
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    {hideableColumns.map((col) => (
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
                  draggable
                  title="Click to sort, drag to reorder"
                  onClick={() => toggleSort(col.key)}
                  onDragStart={() => setDraggedColumn(col.key)}
                  onDragEnter={() => setDragOverColumn(col.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleColumnDrop(col.key)}
                  onDragEnd={() => {
                    setDraggedColumn(null);
                    setDragOverColumn(null);
                  }}
                  className={`relative cursor-grab select-none truncate px-3 py-2 hover:text-black/80 active:cursor-grabbing dark:hover:text-white/80 ${
                    active ? "text-black/80 dark:text-white/80" : ""
                  } ${
                    dragOverColumn === col.key && draggedColumn !== col.key
                      ? "bg-black/10 dark:bg-white/10"
                      : ""
                  }`}
                >
                  {col.key === "fav" ? "" : col.label}
                  {active && (
                    <span className="ml-1 inline-flex align-middle">
                      {sortDir === "asc" ? (
                        <CaretUp size={12} weight="bold" />
                      ) : (
                        <CaretDown size={12} weight="bold" />
                      )}
                    </span>
                  )}
                  {!NON_RESIZABLE_COLUMNS.has(col.key) && (
                    <div
                      draggable={false}
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
            label={tagEditor.kind === "type" ? "Type" : tagEditor.kind === "tags" ? "Tags" : "Area"}
            multiple
            maxSelections={tagEditor.kind === "type" ? 3 : undefined}
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
