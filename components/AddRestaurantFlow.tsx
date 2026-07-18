"use client";

import { useState } from "react";
import { RestaurantForm } from "./RestaurantForm";
import { useRestaurantUI } from "./AppShell";
import { ModalHeader } from "./BottomSheet";
import { suggestTagName } from "@/lib/tags";
import { findByPlaceId, insertRestaurant, updateRestaurant } from "@/lib/restaurants";
import { linkPendingPhotos } from "@/lib/photos";
import { placesFetch } from "@/lib/placesApi";
import type { Restaurant, RestaurantFormValues } from "@/lib/types";

interface SearchResult {
  placeId: string;
  name: string;
  address: string;
}

function toFormInitial(restaurant: Restaurant): Partial<RestaurantFormValues> {
  return {
    name: restaurant.name,
    address: restaurant.address,
    lat: restaurant.lat,
    lng: restaurant.lng,
    phone: restaurant.phone,
    website: restaurant.website,
    price_level: restaurant.price_level,
    opening_hours: restaurant.opening_hours,
    google_place_id: restaurant.google_place_id,
    notes: restaurant.notes,
    photo_url: restaurant.photo_url,
    primary_tag_id: restaurant.primary_tag_id,
    typeIds: restaurant.types.map((t) => t.id),
    tagIds: restaurant.tags.map((t) => t.id),
    areaIds: restaurant.areas.map((t) => t.id),
  };
}

export function AddRestaurantFlow({
  editing,
  onSaved,
  initialQuery,
  onClose,
}: {
  editing?: Restaurant;
  onSaved: (restaurant: Restaurant) => void;
  initialQuery?: string;
  onClose: () => void;
}) {
  const { activeDestinationId } = useRestaurantUI();
  const [step, setStep] = useState<"search" | "results" | "form">(editing ? "form" : "search");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<RestaurantFormValues>>(
    editing ? toFormInitial(editing) : {}
  );
  const [suggestedTagName, setSuggestedTagName] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Restaurant | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setDuplicate(null);
    try {
      const res = await placesFetch("search", { query });
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
      setStep("results");
    } finally {
      setLoading(false);
    }
  }

  async function pickResult(result: SearchResult) {
    setLoading(true);
    try {
      const existing = await findByPlaceId(result.placeId);
      if (existing) {
        setDuplicate(existing);
        return;
      }

      const res = await placesFetch("details", { placeId: result.placeId });
      const details = await res.json();

      setFormInitial({
        name: details.name,
        address: details.address,
        lat: details.lat,
        lng: details.lng,
        phone: details.phone,
        website: details.website,
        price_level: details.priceLevel,
        opening_hours: details.openingHours,
        google_place_id: details.placeId,
        typeIds: [],
        tagIds: [],
        areaIds: [],
      });
      setSuggestedTagName(suggestTagName(details.primaryType));
      setStep("form");
    } finally {
      setLoading(false);
    }
  }

  function addManually() {
    setFormInitial({});
    setSuggestedTagName(null);
    setStep("form");
  }

  async function handleSave(values: RestaurantFormValues, pendingPhotoPaths: string[]): Promise<Restaurant> {
    const destinationId = editing ? editing.destination_id : activeDestinationId;
    if (!destinationId) throw new Error("No active destination to save this restaurant under.");
    const input = { ...values, destination_id: destinationId };
    const saved = editing ? await updateRestaurant(editing.id, input) : await insertRestaurant(input);
    if (pendingPhotoPaths.length) {
      await linkPendingPhotos(saved.id, pendingPhotoPaths);
    }
    onSaved(saved);
    return saved;
  }

  if (duplicate) {
    return (
      <div className="flex flex-col gap-3">
        <ModalHeader
          title={<h2 className="text-lg">Already on your list</h2>}
          onClose={onClose}
        />
        <p className="text-sm text-black/70 dark:text-white/70">
          <b>{duplicate.name}</b> is already saved.
        </p>
        <button
          onClick={() => {
            setFormInitial(toFormInitial(duplicate));
            setDuplicate(null);
            setStep("form");
          }}
          className="rounded-lg bg-black py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          View / edit it instead
        </button>
      </div>
    );
  }

  if (step === "form") {
    return (
      <>
        <ModalHeader
          title={
            <h2 className="text-lg">{editing ? "Edit restaurant" : "Add restaurant"}</h2>
          }
          onClose={onClose}
          className="mb-3"
        />
        <RestaurantForm
          initial={formInitial}
          restaurantId={editing?.id}
          onSubmit={handleSave}
          suggestedTagName={suggestedTagName}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ModalHeader title={<h2 className="text-lg">Add restaurant</h2>} onClose={onClose} />
      <form onSubmit={runSearch} className="flex gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a restaurant…"
          className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>
      <button
        onClick={addManually}
        className="w-fit text-sm text-black/60 underline dark:text-white/60"
      >
        or add manually
      </button>

      {step === "results" && (
        <div className="flex flex-col gap-2">
          {searched && results.length === 0 && (
            <p className="text-sm text-black/60 dark:text-white/60">
              No matches — try a different search or add manually.
            </p>
          )}
          {results.map((r) => (
            <button
              key={r.placeId}
              onClick={() => pickResult(r)}
              className="flex flex-col rounded-lg border border-black/10 px-3 py-2 text-left text-sm hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/5"
            >
              <span className="font-bold">{r.name}</span>
              <span className="text-black/60 dark:text-white/60">{r.address}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
