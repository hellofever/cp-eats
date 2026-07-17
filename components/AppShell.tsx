"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchRestaurants } from "@/lib/restaurants";
import { fetchTags, type Tag } from "@/lib/tags";
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
  tags: Tag[];
  areas: Tag[];
  cities: Tag[];
  restaurantsError: boolean;
  tagsError: boolean;
  lastSyncedAt: Date | null;

  // Force a full refetch of a domain -- used by Settings' "Sync now" button and by
  // Realtime event handlers. Falls back to serving stale cached data on failure.
  syncNow: () => Promise<void>;
  syncRestaurants: () => Promise<void>;
  syncTags: () => Promise<void>;

  // Patch the cache directly from a mutation's own return value/known new state --
  // the default path after a create/update/delete, so most mutations don't need a
  // round trip back to Supabase just to see their own effect reflected everywhere.
  patchRestaurantCache: (restaurant: Restaurant) => void;
  removeRestaurantsCache: (ids: string[]) => void;
  patchTagCache: (tag: Tag) => void;
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

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [areas, setAreas] = useState<Tag[]>([]);
  const [cities, setCities] = useState<Tag[]>([]);
  const [restaurantsError, setRestaurantsError] = useState(false);
  const [tagsError, setTagsError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  async function syncRestaurants() {
    try {
      const data = await fetchRestaurants();
      setRestaurants(data);
      setRestaurantsError(false);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error(err);
      setRestaurantsError(true);
    }
  }

  async function syncTags() {
    try {
      const [t, a, c] = await Promise.all([fetchTags("tag"), fetchTags("area"), fetchTags("city")]);
      setTags(t);
      setAreas(a);
      setCities(c);
      setTagsError(false);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error(err);
      setTagsError(true);
    }
  }

  async function syncNow() {
    await Promise.all([syncRestaurants(), syncTags()]);
  }

  function patchRestaurantCache(restaurant: Restaurant) {
    setRestaurants((prev) => upsertByIdSortedByName(prev, restaurant));
  }

  function removeRestaurantsCache(ids: string[]) {
    const idSet = new Set(ids);
    setRestaurants((prev) => prev.filter((r) => !idSet.has(r.id)));
  }

  function patchTagCache(tag: Tag) {
    const setter = tag.kind === "tag" ? setTags : tag.kind === "area" ? setAreas : setCities;
    setter((prev) => upsertByIdSortedByName(prev, tag));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncNow().finally(() => setInitialLoadDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
        tags,
        areas,
        cities,
        restaurantsError,
        tagsError,
        lastSyncedAt,
        syncNow,
        syncRestaurants,
        syncTags,
        patchRestaurantCache,
        removeRestaurantsCache,
        patchTagCache,
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
