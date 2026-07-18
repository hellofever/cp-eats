"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { ArrowsHorizontal, Compass, GpsFix } from "@phosphor-icons/react";
import { PHOSPHOR_ICON_MAP, tagIcon, tagMapColor } from "@/lib/tags";
import { useRestaurantUI } from "./AppShell";
import { MapControlsDrawer } from "./MapControlsDrawer";
import { MapBottomCard } from "./MapBottomCard";
import { matchesFilters } from "./ListFilters";
import type { Restaurant } from "@/lib/types";
import type { Destination } from "@/lib/destinations";

// Shared zoom for both "pan to a selected pin" and "locate me" -- street scale
// (~4m/px, so a phone-width viewport spans roughly 1.5km).
const FOCUS_ZOOM = 16;
// Fixed recenter zoom on a destination switch -- a bit wider than a single-restaurant
// focus so a whole city reads reasonably, though a country-sized destination (e.g.
// "Mexico") will still look too zoomed-in at this level. Getting that right needs
// Google's viewport bounds (not just a point), which isn't stored yet -- see the
// destinations table/Places search route if this becomes worth fixing properly.
const DESTINATION_ZOOM = 14;
// Type-safety fallback only -- AuthenticatedShell (see AppShell.tsx) never renders
// MapView until activeDestination has resolved, so this never actually surfaces.
const FALLBACK_CENTER = { lat: -33.8688, lng: 151.2093 };
// fitBounds zooms all the way to street level for a single-restaurant match (a
// zero-area box) -- cap it at roughly suburb scale instead.
const FIT_MAX_ZOOM = 16;
// Floor for ResetViewButton's fit-to-all-pins zoom -- stops the reset from swinging
// out to a country/globe view when pins are very spread out (or one has a bad
// coordinate), landing no wider than roughly a metro area.
const RESET_MIN_ZOOM = DESTINATION_ZOOM - 4;

// Imperatively pans/zooms once both the map instance and the target restaurant are
// ready -- can't just use a smarter defaultCenter/defaultZoom, since the restaurant
// list (and therefore which one matches focusPlaceId) loads asynchronously after the
// Map has already mounted at its default view.
function FocusOnPlace({ restaurant }: { restaurant: Restaurant | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !restaurant || restaurant.lat == null || restaurant.lng == null) return;
    animateCameraTo(map, { lat: restaurant.lat, lng: restaurant.lng, zoom: FOCUS_ZOOM });
  }, [map, restaurant]);
  return null;
}

// Recenters when the active destination actually changes (switching from the switcher,
// not the initial mount -- defaultCenter/defaultZoom on <Map> already placed it there,
// see MapView below). Jumps instantly rather than animating like the other camera
// moves in this file -- a destination switch is a full change of city/context, not a
// pan within the same one, so an eased tween across the intervening ocean/continent
// just reads as a slow crossfade rather than useful motion.
function RecenterOnDestinationChange({ destination }: { destination: Destination }) {
  const map = useMap();
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (!map || destination.lat == null || destination.lng == null) return;
    map.moveCamera({ center: { lat: destination.lat, lng: destination.lng }, zoom: DESTINATION_ZOOM });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, destination.id]);
  return null;
}

// Recenters/zooms to fit every currently tag/area-filtered restaurant whenever the
// active filter set changes -- e.g. picking "Bakery" fits the map to just the
// bakeries. Keyed off a sorted id string rather than the `restaurants` array itself
// so it doesn't refire on every render (filtered is a fresh array each time). Skipped
// entirely when no tag/area filter is active, so clearing filters doesn't yank the
// viewport back to some default -- it just leaves the map where the user left it.
function FitToFilter({ active, restaurants }: { active: boolean; restaurants: GeoRestaurant[] }) {
  const map = useMap();
  const key = restaurants
    .map((r) => r.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!map || !active || restaurants.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    restaurants.forEach((r) => bounds.extend({ lat: r.lat, lng: r.lng }));
    animateFitBounds(map, bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, key]);
  return null;
}

// Fits the map to every geo-tagged restaurant once, right after the (async) restaurant
// list first resolves -- `done` guards it to run at most once per mount, so it doesn't
// fight the user's own panning/zooming afterwards, or FitToFilter/RecenterOnDestinationChange
// on later renders. Skipped when a filter is already active (FitToFilter owns the fit
// in that case) or the map is deep-linking to one specific place (FocusOnPlace owns it).
function FitToAllOnLoad({ restaurants, skip }: { restaurants: GeoRestaurant[]; skip: boolean }) {
  const map = useMap();
  const done = useRef(false);
  const hasData = restaurants.length > 0;
  useEffect(() => {
    if (done.current || !map || skip || !hasData) return;
    done.current = true;
    const bounds = new google.maps.LatLngBounds();
    restaurants.forEach((r) => bounds.extend({ lat: r.lat, lng: r.lng }));
    animateFitBounds(map, bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, skip, hasData]);
  return null;
}

// Restaurants without a resolved location never reach this component or FitToFilter --
// see the `geoTagged` filter in MapView, which narrows to this type so lat/lng can stay
// non-null here without runtime assertions.
type GeoRestaurant = Restaurant & { lat: number; lng: number };

function isGeoTagged(r: Restaurant): r is GeoRestaurant {
  return r.lat != null && r.lng != null;
}

function RestaurantMarker({
  restaurant,
  onSelect,
}: {
  restaurant: GeoRestaurant;
  onSelect: (restaurant: Restaurant) => void;
}) {
  const map = useMap();
  const Icon = PHOSPHOR_ICON_MAP[tagIcon(restaurant.primaryTag)];
  return (
    <AdvancedMarker
      position={{ lat: restaurant.lat, lng: restaurant.lng }}
      onClick={() => {
        if (map) animateCameraTo(map, { lat: restaurant.lat, lng: restaurant.lng, zoom: FOCUS_ZOOM });
        onSelect(restaurant);
      }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow"
        style={{ background: tagMapColor(restaurant.primaryTag) }}
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

const LOCATE_ANIMATION_MS = 800;

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

// The Maps JS API has no synchronous "what zoom would fitBounds pick" query -- this
// hand-rolls the standard Mercator-projection formula (the well-known getBoundsZoomLevel
// approach) so bounds-fitting camera moves (FitToFilter, FitToAllOnLoad, ResetViewButton)
// can animate through animateCameraTo like every other camera move here, instead of
// fitBounds's own instant jump.
function latRad(lat: number) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
  return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
}

function zoomForFraction(pixelSize: number, worldSize: number, fraction: number) {
  return Math.log(pixelSize / worldSize / fraction) / Math.LN2;
}

// A zero-area (single-point) bounds has a lat/lng fraction of 0, which sends this to
// +Infinity -- callers cap the result with FIT_MAX_ZOOM (Math.min(Infinity, cap) is a
// no-op-safe way to land on the cap), matching fitBounds's own zero-area behavior.
function getBoundsZoom(bounds: google.maps.LatLngBounds, mapPx: { width: number; height: number }) {
  const WORLD_DIM = 256;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();

  const latFraction = (latRad(ne.lat()) - latRad(sw.lat())) / Math.PI;
  const lngDiff = ne.lng() - sw.lng();
  const lngFraction = (lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360;

  const latZoom = zoomForFraction(mapPx.height, WORLD_DIM, latFraction);
  const lngZoom = zoomForFraction(mapPx.width, WORLD_DIM, lngFraction);

  return Math.floor(Math.min(latZoom, lngZoom));
}

// Same padding/maxZoom shape map.fitBounds() itself takes, but animates there via
// animateCameraTo instead of snapping instantly. `minZoom` is opt-in (unlike
// map.fitBounds(), which has no lower bound) -- callers whose bounds could span an
// unreasonably wide area (a stray bad coordinate, or just a very spread-out pin set)
// pass one to stop the camera from zooming out past a sensible floor.
function animateFitBounds(
  map: google.maps.Map,
  bounds: google.maps.LatLngBounds,
  { padding = 64, maxZoom = FIT_MAX_ZOOM, minZoom }: { padding?: number; maxZoom?: number; minZoom?: number } = {}
) {
  const div = map.getDiv();
  const width = div.clientWidth - padding * 2;
  const height = div.clientHeight - padding * 2;
  if (width <= 0 || height <= 0) {
    map.fitBounds(bounds, padding);
    return;
  }
  const center = bounds.getCenter();
  let zoom = Math.min(getBoundsZoom(bounds, { width, height }), maxZoom);
  if (minZoom != null) zoom = Math.max(zoom, minZoom);
  animateCameraTo(map, { lat: center.lat(), lng: center.lng(), zoom });
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
        if (map) animateCameraTo(map, { ...point, zoom: FOCUS_ZOOM });
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
      <GpsFix size={22} weight="bold" className={locating ? "animate-pulse" : undefined} />
    </button>
  );
}

// Resets the camera to fit every currently loaded pin in view -- same fitBounds
// approach as FitToAllOnLoad/FitToFilter above, rather than recentering on the
// destination's own coordinates. Falls back to the destination's center/zoom only
// when there are no geo-tagged restaurants to fit bounds to yet.
function ResetViewButton({
  restaurants,
  destination,
}: {
  restaurants: GeoRestaurant[];
  destination: Destination | null;
}) {
  const map = useMap();

  function handleClick() {
    if (!map) return;
    if (restaurants.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      restaurants.forEach((r) => bounds.extend({ lat: r.lat, lng: r.lng }));
      animateFitBounds(map, bounds, { minZoom: RESET_MIN_ZOOM });
      return;
    }
    if (destination?.lat != null && destination?.lng != null) {
      animateCameraTo(map, { lat: destination.lat, lng: destination.lng, zoom: DESTINATION_ZOOM });
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Reset map view"
      className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black/70 shadow backdrop-blur dark:bg-black/80 dark:text-white/70"
    >
      <Compass size={22} weight="bold" />
    </button>
  );
}

// The "you are here" dot dropped at the last located position.
function UserLocationMarker({ position }: { position: { lat: number; lng: number } }) {
  return (
    <AdvancedMarker position={position}>
      <div className="h-4 w-4 rounded-full border-2 border-white bg-red-500 shadow" />
    </AdvancedMarker>
  );
}

export function MapView({
  focusPlaceId,
  typeIds = [],
  tagIds = [],
  areaIds = [],
}: {
  focusPlaceId?: string | null;
  typeIds?: string[];
  tagIds?: string[];
  areaIds?: string[];
}) {
  const { restaurants, restaurantsError, syncRestaurants, activeDestination } = useRestaurantUI();
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

  // Guards against a stale-pin flash right after switching destinations: `restaurants`
  // still holds the previous destination's rows for the moment between the camera jump
  // (RecenterOnDestinationChange, driven by activeDestination) and syncRestaurants'
  // fetch resolving with the new destination's rows.
  const scoped = activeDestination
    ? restaurants.filter((r) => r.destination_id === activeDestination.id)
    : restaurants;
  const filtered = scoped.filter((r) =>
    matchesFilters(r, { typeIds, tagIds, areaIds, favouritesOnly: false })
  );
  const geoTagged = filtered.filter(isGeoTagged);
  const filtersActive = typeIds.length > 0 || tagIds.length > 0 || areaIds.length > 0;

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
            defaultCenter={
              activeDestination?.lat != null && activeDestination?.lng != null
                ? { lat: activeDestination.lat, lng: activeDestination.lng }
                : FALLBACK_CENTER
            }
            defaultZoom={DESTINATION_ZOOM}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "7a03f40461f9aed667a8cf4f"}
            gestureHandling="greedy"
            clickableIcons={false}
            mapTypeControl={false}
            fullscreenControl={false}
            streetViewControl={false}
            rotateControl={false}
            zoomControl={false}
            cameraControl={false}
            onClick={() => setSelectedId(null)}
          >
            <FitToFilter active={filtersActive} restaurants={geoTagged} />
            <FitToAllOnLoad restaurants={geoTagged} skip={filtersActive || Boolean(focusPlaceId)} />
            {activeDestination && <RecenterOnDestinationChange destination={activeDestination} />}
            <FocusOnPlace restaurant={focusedRestaurant} />
            {geoTagged.map((r) => (
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

          {/* Desktop: independent corner buttons + centered card, unchanged. */}
          <div className="absolute bottom-4 right-4 z-20 hidden flex-col gap-3 md:flex">
            <ResetViewButton restaurants={geoTagged} destination={activeDestination} />
            <LocateMeButton onLocated={setUserLocation} />
          </div>
          <div className="hidden md:block">
            <MapBottomCard restaurant={selectedRestaurant} onClose={() => setSelectedId(null)} />
          </div>

          {/* Mobile: one bottom-anchored flex column so the full-width card sliding in
              pushes the buttons up above it. */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 md:hidden">
            <div
              className={`flex flex-col items-end gap-3 pr-4 ${selectedRestaurant ? "" : "pb-4"}`}
            >
              <ResetViewButton restaurants={geoTagged} destination={activeDestination} />
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
