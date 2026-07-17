"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { ArrowsHorizontal, Target } from "@phosphor-icons/react";
import { PHOSPHOR_ICON_MAP, tagColor, tagIcon } from "@/lib/tags";
import { useRestaurantUI } from "./AppShell";
import { MapControlsDrawer } from "./MapControlsDrawer";
import { MapBottomCard } from "./MapBottomCard";
import { matchesFilters } from "./ListFilters";
import type { Restaurant } from "@/lib/types";

const FOCUS_ZOOM = 17;
// Wider than FOCUS_ZOOM -- centering on the user shouldn't snap in as tight as
// focusing a single restaurant pin, it should still show the surrounding area.
const LOCATE_ZOOM = 14;
// fitBounds zooms all the way to street level for a single-restaurant match (a
// zero-area box) -- cap it at roughly suburb scale instead.
const FIT_MAX_ZOOM = 16;

// Imperatively pans/zooms once both the map instance and the target restaurant are
// ready -- can't just use a smarter defaultCenter/defaultZoom, since the restaurant
// list (and therefore which one matches focusPlaceId) loads asynchronously after the
// Map has already mounted at its default view.
function FocusOnPlace({ restaurant }: { restaurant: Restaurant | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !restaurant) return;
    map.panTo({ lat: restaurant.lat, lng: restaurant.lng });
    map.setZoom(FOCUS_ZOOM);
  }, [map, restaurant]);
  return null;
}

// Recenters/zooms to fit every currently tag/area-filtered restaurant whenever the
// active filter set changes -- e.g. picking "Bakery" fits the map to just the
// bakeries. Keyed off a sorted id string rather than the `restaurants` array itself
// so it doesn't refire on every render (filtered is a fresh array each time). Skipped
// entirely when no tag/area filter is active, so clearing filters doesn't yank the
// viewport back to some default -- it just leaves the map where the user left it.
function FitToFilter({ active, restaurants }: { active: boolean; restaurants: Restaurant[] }) {
  const map = useMap();
  const key = restaurants
    .map((r) => r.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!map || !active || restaurants.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    restaurants.forEach((r) => bounds.extend({ lat: r.lat, lng: r.lng }));
    map.fitBounds(bounds, 64);
    const listener = google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM);
    });
    return () => google.maps.event.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, key]);
  return null;
}

function RestaurantMarker({
  restaurant,
  onSelect,
}: {
  restaurant: Restaurant;
  onSelect: (restaurant: Restaurant) => void;
}) {
  const map = useMap();
  const Icon = PHOSPHOR_ICON_MAP[tagIcon(restaurant.primaryTag)];
  return (
    <AdvancedMarker
      position={{ lat: restaurant.lat, lng: restaurant.lng }}
      onClick={() => {
        map?.panTo({ lat: restaurant.lat, lng: restaurant.lng });
        onSelect(restaurant);
      }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow"
        style={{ background: tagColor(restaurant.primaryTag) }}
      >
        <Icon size={16} weight="bold" color="#ffffff" />
      </div>
    </AdvancedMarker>
  );
}

// Stays anchored over the map itself (not the drawer) so its position doesn't drift
// when the drawer occupies the space beside it on desktop.
function MapExpandButton({
  open,
  onToggle,
  centerRef,
}: {
  open: boolean;
  onToggle: () => void;
  centerRef: React.MutableRefObject<google.maps.LatLng | null>;
}) {
  const map = useMap();
  return (
    <button
      onClick={() => {
        centerRef.current = map?.getCenter() ?? null;
        onToggle();
      }}
      aria-label={open ? "Close map controls" : "Open map controls"}
      className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black/70 shadow backdrop-blur dark:bg-black/80 dark:text-white/70"
    >
      <ArrowsHorizontal size={18} weight="bold" />
    </button>
  );
}

const LOCATE_ANIMATION_MS = 600;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// panTo() alone only animates the pan, not the zoom -- there's no built-in "animate to
// zoom" method in the Maps JS API, so this hand-rolls the standard requestAnimationFrame
// + moveCamera() easing pattern from Google's own "Move Camera Easing" example instead
// of pulling in an animation library for one tween.
function animateCameraTo(map: google.maps.Map, target: { lat: number; lng: number; zoom: number }) {
  const startCenter = map.getCenter();
  const startZoom = map.getZoom();
  if (!startCenter || startZoom === undefined) {
    map.moveCamera({ center: target, zoom: target.zoom });
    return;
  }
  const start = { lat: startCenter.lat(), lng: startCenter.lng(), zoom: startZoom };
  const startTime = performance.now();

  function step(now: number) {
    const t = easeOutCubic(Math.min((now - startTime) / LOCATE_ANIMATION_MS, 1));
    map.moveCamera({
      center: {
        lat: start.lat + (target.lat - start.lat) * t,
        lng: start.lng + (target.lng - start.lng) * t,
      },
      zoom: start.zoom + (target.zoom - start.zoom) * t,
    });
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Centers the map on the browser's geolocation result. Kept as its own component (not
// inline in MapView) since it needs useMap() -- same reason MapExpandButton is split
// out above it. The located coordinates are reported up to MapView (rather than kept
// local) so the same point can also render as a marker inside <Map>.
function LocateMeButton({ onLocated }: { onLocated: (position: { lat: number; lng: number }) => void }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  function handleClick() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (map) animateCameraTo(map, { ...point, zoom: LOCATE_ZOOM });
        onLocated(point);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={locating}
      aria-label="Center on my location"
      className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black/70 shadow backdrop-blur disabled:opacity-60 dark:bg-black/80 dark:text-white/70"
    >
      <Target size={22} weight="bold" className={locating ? "animate-pulse" : undefined} />
    </button>
  );
}

// The orange "you are here" dot dropped at the last located position.
function UserLocationMarker({ position }: { position: { lat: number; lng: number } }) {
  return (
    <AdvancedMarker position={position}>
      <div className="h-4 w-4 rounded-full border-2 border-white bg-orange-500 shadow" />
    </AdvancedMarker>
  );
}

export function MapView({
  focusPlaceId,
  tagIds = [],
  areaIds = [],
}: {
  focusPlaceId?: string | null;
  tagIds?: string[];
  areaIds?: string[];
}) {
  const { restaurants, restaurantsError, syncRestaurants } = useRestaurantUI();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const centerBeforeResize = useRef<google.maps.LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const focusedRestaurant = focusPlaceId
    ? (restaurants.find((r) => r.id === focusPlaceId) ?? null)
    : null;

  useEffect(() => {
    if (focusedRestaurant) setSelectedId(focusedRestaurant.id);
  }, [focusedRestaurant]);
  const selectedRestaurant = selectedId
    ? (restaurants.find((r) => r.id === selectedId) ?? null)
    : null;

  const filtered = restaurants.filter((r) =>
    matchesFilters(r, { tagIds, areaIds, favouritesOnly: false })
  );

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-black/50 dark:text-white/50">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local to render the map.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="relative flex flex-1 flex-col md:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1 md:order-2">
          {restaurantsError && (
            <div className="absolute inset-x-0 top-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full bg-white/95 px-4 py-2 text-sm text-black/70 shadow dark:bg-black/85 dark:text-white/70">
              Couldn’t load places.
              <button onClick={() => syncRestaurants()} className="font-medium underline">
                Retry
              </button>
            </div>
          )}
          <Map
            className="h-full w-full"
            defaultCenter={{ lat: -33.8688, lng: 151.2093 }}
            defaultZoom={12}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "7a03f40461f9aed667a8cf4f"}
            gestureHandling="greedy"
            mapTypeControl={false}
            fullscreenControl={false}
            streetViewControl={false}
            rotateControl={false}
            zoomControl={false}
            cameraControl={false}
            onClick={() => setSelectedId(null)}
          >
            <FitToFilter active={tagIds.length > 0 || areaIds.length > 0} restaurants={filtered} />
            <FocusOnPlace restaurant={focusedRestaurant} />
            {filtered.map((r) => (
              <RestaurantMarker
                key={r.id}
                restaurant={r}
                onSelect={(restaurant) => setSelectedId(restaurant.id)}
              />
            ))}
            {userLocation && <UserLocationMarker position={userLocation} />}
          </Map>
          <MapExpandButton
            open={drawerOpen}
            onToggle={() => setDrawerOpen((o) => !o)}
            centerRef={centerBeforeResize}
          />

          {/* Desktop: independent corner button + centered card, unchanged. */}
          <div className="absolute bottom-4 right-4 z-20 hidden md:block">
            <LocateMeButton onLocated={setUserLocation} />
          </div>
          <div className="hidden md:block">
            <MapBottomCard restaurant={selectedRestaurant} onClose={() => setSelectedId(null)} />
          </div>

          {/* Mobile: one bottom-anchored flex column so the full-width card sliding in
              pushes the locate button (and future stacked buttons) up above it. */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 md:hidden">
            <div className={`flex justify-end pr-4 ${selectedRestaurant ? "" : "pb-4"}`}>
              <LocateMeButton onLocated={setUserLocation} />
            </div>
            <MapBottomCard
              restaurant={selectedRestaurant}
              onClose={() => setSelectedId(null)}
              variant="sheet"
            />
          </div>
        </div>
        <MapControlsDrawer open={drawerOpen} centerRef={centerBeforeResize} />
      </div>
    </APIProvider>
  );
}
