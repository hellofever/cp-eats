"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchRestaurants } from "@/lib/restaurants";
import { fetchTags, type Tag, type TagKind } from "@/lib/tags";
import { fetchDestinations, type Destination } from "@/lib/destinations";
import type { Restaurant } from "@/lib/types";
import { Header } from "./Header";
import { BottomSheet } from "./BottomSheet";
import { RestaurantDetailView } from "./RestaurantDetailView";
import { AddRestaurantFlow } from "./AddRestaurantFlow";
import { LoginForm } from "./LoginForm";

type SheetState =
  | { kind: "detail"; restaurant: Restaurant }
  | { kind: "add" }
  | { kind: "edit"; restaurant: Restaurant }
  | { kind: "add-inline"; initialQuery: string; onSaved: (restaurant: Restaurant) => void }
  | null;

interface RestaurantUIContextValue {
  openDetail: (restaurant: Restaurant) => void;
  openEdit: (restaurant: Restaurant) => void;
  openAdd: () => void;
  // Used by the Sheet view's empty-row "+" button: runs the normal search/manual Add
  // flow, but the caller decides what happens on save instead of always opening the
  // detail view -- the Sheet just drops the new row into place, no modal popup.
  openAddInline: (initialQuery: string, onSaved: (restaurant: Restaurant) => void) => void;

  // Cached data, loaded once at login and kept in sync via cache patches + Realtime
  // invalidation (see AuthenticatedShell below) rather than refetched by each consumer.
  restaurants: Restaurant[];
  types: Tag[];
  tags: Tag[];
  areas: Tag[];
  restaurantsError: boolean;
  tagsError: boolean;
  lastSyncedAt: Date | null;

  // Destinations scope the whole app -- restaurants are fetched filtered to
  // activeDestinationId (see fetchRestaurants), not client-side. activeDestinationId
  // is driven by the ?destination= URL param (see the effects below), so it stays
  // shareable and survives reloads/navigation the same way ?q=/?tags= do.
  destinations: Destination[];
  activeDestinationId: string | null;
  activeDestination: Destination | null;
  destinationsError: boolean;

  // Force a full refetch of a domain -- used by Settings' "Sync now" button and by
  // Realtime event handlers. Falls back to serving stale cached data on failure.
  syncNow: () => Promise<void>;
  syncRestaurants: () => Promise<void>;
  syncTags: () => Promise<void>;
  syncDestinations: () => Promise<void>;

  // Patch the cache directly from a mutation's own return value/known new state --
  // the default path after a create/update/delete, so most mutations don't need a
  // round trip back to Supabase just to see their own effect reflected everywhere.
  patchRestaurantCache: (restaurant: Restaurant) => void;
  removeRestaurantsCache: (ids: string[]) => void;
  patchTagCache: (tag: Tag) => void;
  removeTagFromCache: (kind: TagKind, id: string) => void;
  patchDestinationCache: (destination: Destination) => void;
  removeDestinationFromCache: (id: string) => void;
}

const RestaurantUIContext = createContext<RestaurantUIContextValue | null>(null);

export function useRestaurantUI() {
  const ctx = useContext(RestaurantUIContext);
  if (!ctx) throw new Error("useRestaurantUI must be used within AppShell");
  return ctx;
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-black/50 dark:text-white/50">
      Loading…
    </div>
  );
}

function upsertByIdSortedByName<T extends { id: string; name: string }>(list: T[], item: T): T[] {
  const next = list.filter((x) => x.id !== item.id);
  next.push(item);
  next.sort((a, b) => a.name.localeCompare(b.name));
  return next;
}

// Destinations sort oldest-first (not alphabetically) so the original/default
// destination stays first -- see activeDestinationId's fallback below.
function upsertByIdSortedByCreatedAt<T extends { id: string; created_at: string }>(
  list: T[],
  item: T
): T[] {
  const next = list.filter((x) => x.id !== item.id);
  next.push(item);
  next.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return next;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Loading />;
  if (!session) return <LoginForm />;

  // Keyed by session.user.id so a different user signing in on the same browser
  // (shared device) always mounts a fresh AuthenticatedShell instance instead of
  // reusing one whose cache belongs to the previous account.
  return <AuthenticatedShell key={session.user.id}>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [types, setTypes] = useState<Tag[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [areas, setAreas] = useState<Tag[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [restaurantsError, setRestaurantsError] = useState(false);
  const [tagsError, setTagsError] = useState(false);
  const [destinationsError, setDestinationsError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  // Two-stage bootstrap: destinations+tags load first (no destination dependency), then
  // restaurants load once activeDestinationId is resolved from them -- see the effects
  // below. initialLoadDone only flips once both stages have completed at least once.
  const [destinationsAndTagsLoaded, setDestinationsAndTagsLoaded] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const destinationParam = searchParams.get("destination");
  const activeDestinationId = destinationParam ?? destinations[0]?.id ?? null;
  const activeDestination = destinations.find((d) => d.id === activeDestinationId) ?? null;

  // Per-destination restaurant cache, so switching back to a destination already
  // visited this session renders instantly from cache instead of waiting on a fresh
  // network round trip -- syncRestaurants still runs in the background to refresh it.
  // A ref (not state) since writing it must never itself trigger a render.
  const restaurantCacheRef = useRef<Map<string, Restaurant[]>>(new Map());
  // Lets in-flight async calls (fetch responses, Realtime callbacks) check whether the
  // destination they were fetching for is still the active one by the time they
  // resolve, so a slow response for a destination the user already switched away from
  // can't clobber what's on screen.
  const activeDestinationIdRef = useRef(activeDestinationId);
  useEffect(() => {
    activeDestinationIdRef.current = activeDestinationId;
  }, [activeDestinationId]);

  async function syncRestaurants(destinationId: string | null = activeDestinationId) {
    if (!destinationId) return;
    try {
      const data = await fetchRestaurants(destinationId);
      restaurantCacheRef.current.set(destinationId, data);
      if (destinationId === activeDestinationIdRef.current) {
        setRestaurants(data);
        setRestaurantsError(false);
      }
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error(err);
      if (destinationId === activeDestinationIdRef.current) setRestaurantsError(true);
    }
  }

  async function syncTags() {
    try {
      const [ty, ta, a] = await Promise.all([fetchTags("type"), fetchTags("tags"), fetchTags("area")]);
      setTypes(ty);
      setTags(ta);
      setAreas(a);
      setTagsError(false);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error(err);
      setTagsError(true);
    }
  }

  async function syncDestinations() {
    try {
      const data = await fetchDestinations();
      setDestinations(data);
      setDestinationsError(false);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error(err);
      setDestinationsError(true);
    }
  }

  async function syncNow() {
    await Promise.all([syncRestaurants(), syncTags(), syncDestinations()]);
  }

  function patchRestaurantCache(restaurant: Restaurant) {
    setRestaurants((prev) => {
      const next = upsertByIdSortedByName(prev, restaurant);
      if (activeDestinationId) restaurantCacheRef.current.set(activeDestinationId, next);
      return next;
    });
  }

  function removeRestaurantsCache(ids: string[]) {
    const idSet = new Set(ids);
    setRestaurants((prev) => {
      const next = prev.filter((r) => !idSet.has(r.id));
      if (activeDestinationId) restaurantCacheRef.current.set(activeDestinationId, next);
      return next;
    });
  }

  function patchTagCache(tag: Tag) {
    const setter = { type: setTypes, tags: setTags, area: setAreas }[tag.kind];
    setter((prev) => upsertByIdSortedByName(prev, tag));
  }

  function removeTagFromCache(kind: TagKind, id: string) {
    const setter = { type: setTypes, tags: setTags, area: setAreas }[kind];
    setter((prev) => prev.filter((t) => t.id !== id));
  }

  function patchDestinationCache(destination: Destination) {
    setDestinations((prev) => upsertByIdSortedByCreatedAt(prev, destination));
  }

  function removeDestinationFromCache(id: string) {
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([syncDestinations(), syncTags()]).finally(() => setDestinationsAndTagsLoaded(true));
  }, []);

  // Canonicalize the URL once destinations are loaded and none was specified, so the
  // active destination is always shareable/reload-safe -- same pattern Header uses for
  // ?q=, just written once here instead of per-navigation.
  useEffect(() => {
    if (!destinationsAndTagsLoaded || destinationParam || !activeDestinationId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("destination", activeDestinationId);
    router.replace(`${pathname}?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationsAndTagsLoaded, destinationParam, activeDestinationId]);

  useEffect(() => {
    if (!destinationsAndTagsLoaded || !activeDestinationId) return;
    // Render whatever's cached for this destination immediately (empty if we've never
    // fetched it) so a destination switch never shows the previous destination's rows
    // while the fresh fetch below is in flight -- see restaurantCacheRef above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestaurants(restaurantCacheRef.current.get(activeDestinationId) ?? []);
    syncRestaurants(activeDestinationId).finally(() => setInitialLoadDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationsAndTagsLoaded, activeDestinationId]);

  useEffect(() => {
    const channel = supabase
      .channel("restaurant-data-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, () => syncRestaurants())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tags" },
        () => syncRestaurants()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tags" }, () => syncTags())
      .on("postgres_changes", { event: "*", schema: "public", table: "destinations" }, () => syncDestinations())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDestinationId]);

  if (!initialLoadDone) return <Loading />;

  function handleSaved(restaurant: Restaurant) {
    setSheet({ kind: "detail", restaurant });
    patchRestaurantCache(restaurant);
  }

  return (
    <RestaurantUIContext.Provider
      value={{
        openDetail: (r) => setSheet({ kind: "detail", restaurant: r }),
        openEdit: (r) => setSheet({ kind: "edit", restaurant: r }),
        openAdd: () => setSheet({ kind: "add" }),
        openAddInline: (initialQuery, onSaved) => setSheet({ kind: "add-inline", initialQuery, onSaved }),
        restaurants,
        types,
        tags,
        areas,
        restaurantsError,
        tagsError,
        lastSyncedAt,
        destinations,
        activeDestinationId,
        activeDestination,
        destinationsError,
        syncNow,
        syncRestaurants,
        syncTags,
        syncDestinations,
        patchRestaurantCache,
        removeRestaurantsCache,
        patchTagCache,
        removeTagFromCache,
        patchDestinationCache,
        removeDestinationFromCache,
      }}
    >
      <Header onAdd={() => setSheet({ kind: "add" })} />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)}>
        {sheet?.kind === "detail" && (
          <RestaurantDetailView
            key={sheet.restaurant.id}
            restaurant={sheet.restaurant}
            onEdit={() => setSheet({ kind: "edit", restaurant: sheet.restaurant })}
          />
        )}
        {sheet?.kind === "add" && <AddRestaurantFlow onSaved={handleSaved} />}
        {sheet?.kind === "edit" && (
          <AddRestaurantFlow editing={sheet.restaurant} onSaved={handleSaved} />
        )}
        {sheet?.kind === "add-inline" && (
          <AddRestaurantFlow
            initialQuery={sheet.initialQuery}
            onSaved={(r) => {
              setSheet(null);
              sheet.onSaved(r);
            }}
          />
        )}
      </BottomSheet>
    </RestaurantUIContext.Provider>
  );
}
