"use client";

import { useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";

export function MapControlsDrawer({
  open,
  centerRef,
}: {
  open: boolean;
  centerRef: React.MutableRefObject<google.maps.LatLng | null>;
}) {
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const map = useMap();

  function selectMapType(type: "roadmap" | "satellite") {
    setMapType(type);
    map?.setMapTypeId(type);
  }

  // The drawer resizes the map's flex sibling via a plain CSS transition (width on
  // desktop, height on mobile) -- @vis.gl/react-google-maps doesn't watch its container
  // for size changes, so the underlying Google Map only redraws at the new size once we
  // trigger a resize event ourselves, once the transition finishes.
  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (!map) return;
    google.maps.event.trigger(map, "resize");
    if (centerRef.current) map.setCenter(centerRef.current);
  }

  return (
    <div
      onTransitionEnd={handleTransitionEnd}
      className={`shrink-0 overflow-hidden bg-white shadow-xl transition-all duration-300 ease-in-out
        md:order-1 md:h-auto
        dark:bg-zinc-900 ${open ? "h-64 md:w-72" : "h-0 md:w-0"}`}
    >
      <div className="h-64 w-full p-4 md:h-full md:w-72">
        <div className="flex gap-2">
          {(["roadmap", "satellite"] as const).map((type) => (
            <button
              key={type}
              onClick={() => selectMapType(type)}
              className={`rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${
                mapType === type
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "border border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
              }`}
            >
              {type === "roadmap" ? "Map" : "Satellite"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
