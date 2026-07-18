export type ViewName = "map" | "list" | "sheet";

export const VIEWS: ViewName[] = ["map", "list", "sheet"];

export function isViewName(value: string | null): value is ViewName {
  return value !== null && (VIEWS as string[]).includes(value);
}
