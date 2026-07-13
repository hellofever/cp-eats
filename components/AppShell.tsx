"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
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
  // bump after any create/update so Map/List/Sheet pages know to refetch
  refreshToken: number;
  refresh: () => void;
}

const RestaurantUIContext = createContext<RestaurantUIContextValue | null>(null);

export function useRestaurantUI() {
  const ctx = useContext(RestaurantUIContext);
  if (!ctx) throw new Error("useRestaurantUI must be used within AppShell");
  return ctx;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-black/50 dark:text-white/50">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  function handleSaved(restaurant: Restaurant) {
    setSheet({ kind: "detail", restaurant });
    setRefreshToken((n) => n + 1);
  }

  return (
    <RestaurantUIContext.Provider
      value={{
        openDetail: (r) => setSheet({ kind: "detail", restaurant: r }),
        openEdit: (r) => setSheet({ kind: "edit", restaurant: r }),
        openAdd: () => setSheet({ kind: "add" }),
        openAddInline: (initialQuery, onSaved) => setSheet({ kind: "add-inline", initialQuery, onSaved }),
        refreshToken,
        refresh: () => setRefreshToken((n) => n + 1),
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
