"use client";

import { useState } from "react";
import { placesFetch } from "@/lib/placesApi";

export interface PlacePickResult {
  placeId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

// Shared "search Google Places, pick one result" step -- used by DestinationSwitcher's
// New Destination flow and DestinationSettings' location editor.
export function PlaceSearchPicker({
  placeholder = "Search a place…",
  onPick,
}: {
  placeholder?: string;
  onPick: (result: PlacePickResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlacePickResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await placesFetch("search", { query });
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={runSearch} className="flex gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 ${inputClass}`}
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>

      {searched && results.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Couldn’t find that place on Google Maps — try a different name.
        </p>
      )}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r) => (
            <button
              key={r.placeId}
              onClick={() => onPick(r)}
              className="flex flex-col rounded-lg border border-black/10 px-3 py-2 text-left text-sm hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/5"
            >
              <span className="font-medium">{r.name}</span>
              <span className="text-black/60 dark:text-white/60">{r.address}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
