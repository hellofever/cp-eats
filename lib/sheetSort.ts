import type { Restaurant } from "./types";

export type SheetColumn =
  | "fav"
  | "name"
  | "tags"
  | "area"
  | "city"
  | "address"
  | "phone"
  | "price"
  | "notes";

export type SortDirection = "asc" | "desc";

export function isSheetColumn(value: string | null): value is SheetColumn {
  return (
    value === "fav" ||
    value === "name" ||
    value === "tags" ||
    value === "area" ||
    value === "city" ||
    value === "address" ||
    value === "phone" ||
    value === "price" ||
    value === "notes"
  );
}

// Empty/null values always sort last regardless of direction -- an unset field isn't
// meaningfully "less than" a set one, so flipping direction shouldn't move it to the top.
function compareNullableString(a: string | null, b: string | null, dir: SortDirection): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b) * (dir === "asc" ? 1 : -1);
}

function comparePriceLevel(a: number | null, b: number | null, dir: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * (dir === "asc" ? 1 : -1);
}

export function formatPriceLevel(level: number | null): string {
  return level ? "$".repeat(level) : "";
}

// Accepts "$".."$$$$" or a plain "1".."4"; anything else (including empty) is "not set".
// Shared between manual cell edits and pasted values so both parse identically.
export function parsePriceLevel(raw: string): number | null {
  const value = raw.trim();
  if (/^\${1,4}$/.test(value)) return value.length;
  const num = Number(value);
  if (Number.isInteger(num) && num >= 1 && num <= 4) return num;
  return null;
}

// Tags/Area sort by the exact same joined string shown in the cell -- "what you see is
// what it sorts by", rather than a different ordering the user can't see reflected.
export function compareRestaurants(
  a: Restaurant,
  b: Restaurant,
  column: SheetColumn,
  dir: SortDirection
): number {
  const mul = dir === "asc" ? 1 : -1;
  switch (column) {
    case "fav":
      return (Number(a.is_favourite) - Number(b.is_favourite)) * mul;
    case "name":
      return a.name.localeCompare(b.name) * mul;
    case "tags":
      return compareNullableString(
        a.tags.map((t) => t.name).join(", ") || null,
        b.tags.map((t) => t.name).join(", ") || null,
        dir
      );
    case "area":
      return compareNullableString(
        a.areas.map((ar) => ar.name).join(", ") || null,
        b.areas.map((ar) => ar.name).join(", ") || null,
        dir
      );
    case "city":
      return compareNullableString(a.city?.name ?? null, b.city?.name ?? null, dir);
    case "address":
      return a.address.localeCompare(b.address) * mul;
    case "phone":
      return compareNullableString(a.phone, b.phone, dir);
    case "price":
      return comparePriceLevel(a.price_level, b.price_level, dir);
    case "notes":
      return compareNullableString(a.notes, b.notes, dir);
    default:
      return 0;
  }
}
