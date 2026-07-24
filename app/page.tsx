"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapView } from "@/components/MapView";
import { ListView } from "@/components/ListView";
import { SheetView } from "@/components/SheetView";
import { isViewName, type ViewName } from "@/lib/view";

// Map/List/Sheet used to be three separate routes, so switching between them unmounted
// and remounted the whole page -- losing scroll position, map camera, Sheet selection,
// in-progress edits, etc. every time. They're one route now, switched with ?view= (same
// pattern as ?q=/?tags=/?sort=), and all three bodies mount once (on first visit) and
// stay mounted forever after -- switching tabs just toggles which one is visible, via
// `invisible` (not `hidden`/display:none) so an inactive view's box never collapses to
// 0x0. That matters most for the map: display:none is what causes Google Maps' classic
// "grey tiles" bug when a hidden map is later revealed, since visibility:hidden never
// changes the container's layout size, there's nothing for the Maps SDK to need to
// recover from.
export default function HomePage() {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const view: ViewName = isViewName(viewParam) ? viewParam : "map";

  // "Adjusting state during render" (react.dev's documented alternative to an effect
  // for this exact case) instead of a useEffect -- this only ever needs to run when
  // `view` itself changes, which the prevView comparison already detects without an
  // extra post-commit render.
  const [mountedViews, setMountedViews] = useState<Set<ViewName>>(() => new Set([view]));
  const [prevView, setPrevView] = useState(view);
  if (view !== prevView) {
    setPrevView(view);
    if (!mountedViews.has(view)) setMountedViews(new Set(mountedViews).add(view));
  }

  const focusPlaceId = searchParams.get("place");
  const mapTypeIds = (searchParams.get("mapTypes") ?? "").split(",").filter(Boolean);
  const mapTagIds = (searchParams.get("mapTags") ?? "").split(",").filter(Boolean);
  const mapAreaIds = (searchParams.get("mapAreas") ?? "").split(",").filter(Boolean);

  function layerClassName(name: ViewName, base: string) {
    return `absolute inset-0 ${base} ${view === name ? "" : "invisible pointer-events-none"}`;
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {mountedViews.has("map") && (
        <div aria-hidden={view !== "map"} className={layerClassName("map", "flex flex-col")}>
          <MapView
            isActive={view === "map"}
            focusPlaceId={focusPlaceId}
            typeIds={mapTypeIds}
            tagIds={mapTagIds}
            areaIds={mapAreaIds}
          />
        </div>
      )}
      {mountedViews.has("list") && (
        <div aria-hidden={view !== "list"} className={layerClassName("list", "flex flex-col overflow-hidden")}>
          <ListView />
        </div>
      )}
      {mountedViews.has("sheet") && (
        <div aria-hidden={view !== "sheet"} className={layerClassName("sheet", "flex flex-col overflow-hidden")}>
          <SheetView />
        </div>
      )}
    </div>
  );
}
