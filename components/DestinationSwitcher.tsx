"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretDown } from "@phosphor-icons/react";
import { Dropdown, dropdownTriggerClass } from "./Dropdown";
import { BottomSheet } from "./BottomSheet";
import { PlaceSearchPicker, type PlacePickResult } from "./PlaceSearchPicker";
import { useRestaurantUI } from "./AppShell";
import { createDestination, type Destination } from "@/lib/destinations";

// The dropdown next to "CP Places" that scopes the whole app to one destination --
// switching just points ?destination= at a different id (AppShell's context refetches
// restaurants scoped to it), no page reload. `beforeOpenCreate` lets the mobile menu
// close itself first (same pattern as its "Add Place"/"Settings" buttons) so the
// New Destination sheet never opens stacked on top of the still-open menu sheet.
export function DestinationSwitcher({ beforeOpenCreate }: { beforeOpenCreate?: () => void }) {
  const { destinations, activeDestinationId, patchDestinationCache } = useRestaurantUI();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);

  const active = destinations.find((d) => d.id === activeDestinationId) ?? null;

  function switchTo(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("destination", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      {/* Keyed by the active id so picking a destination/finishing "create" remounts
          the Dropdown closed, instead of needing an imperative close API from it. */}
      <Dropdown
        key={activeDestinationId ?? "none"}
        trigger={({ toggle }) => (
          <button onClick={toggle} className={dropdownTriggerClass}>
            {active?.name ?? "Destination"}
            <CaretDown size={12} weight="bold" />
          </button>
        )}
      >
        <div className="flex flex-col gap-1">
          {destinations.map((d) => (
            <button
              key={d.id}
              onClick={() => switchTo(d.id)}
              className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
                d.id === activeDestinationId
                  ? "bg-black/[.04] font-medium dark:bg-white/[.08]"
                  : "hover:bg-black/[.03] dark:hover:bg-white/[.05]"
              }`}
            >
              {d.name}
            </button>
          ))}
          <div className="mt-1 border-t border-black/10 pt-1 dark:border-white/10">
            <button
              onClick={() => {
                beforeOpenCreate?.();
                setCreating(true);
              }}
              className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-black/60 hover:bg-black/[.03] dark:text-white/60 dark:hover:bg-white/[.05]"
            >
              + New Destination
            </button>
          </div>
        </div>
      </Dropdown>

      <BottomSheet open={creating} onClose={() => setCreating(false)}>
        <NewDestinationForm
          onCreated={(d) => {
            patchDestinationCache(d);
            switchTo(d.id);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      </BottomSheet>
    </>
  );
}

function NewDestinationForm({
  onCreated,
  onCancel,
}: {
  onCreated: (destination: Destination) => void;
  onCancel: () => void;
}) {
  const { destinations } = useRestaurantUI();
  const [picked, setPicked] = useState<PlacePickResult | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(result: PlacePickResult) {
    setPicked(result);
    setName(result.name);
    setError(null);
  }

  async function handleCreate() {
    if (!picked) return;
    if (picked.lat == null || picked.lng == null) {
      setError("Couldn't resolve a location for that place — try a different result.");
      return;
    }
    const existing = destinations.find((d) => d.google_place_id === picked.placeId);
    if (existing) {
      onCreated(existing);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createDestination({
        name: name.trim() || picked.name,
        googlePlaceId: picked.placeId,
        lat: picked.lat,
        lng: picked.lng,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";

  if (picked) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="pr-8 text-lg font-semibold">New destination</h2>
        <p className="text-sm text-black/60 dark:text-white/60">{picked.address}</p>
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Creating…" : "Create destination"}
        </button>
        <button
          onClick={() => setPicked(null)}
          className="w-fit text-sm text-black/60 underline dark:text-white/60"
        >
          Back to results
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="pr-8 text-lg font-semibold">New destination</h2>
      <PlaceSearchPicker placeholder="City or country, e.g. Mexico City, Mexico" onPick={pick} />
      <button onClick={onCancel} className="w-fit text-sm text-black/60 underline dark:text-white/60">
        Cancel
      </button>
    </div>
  );
}
