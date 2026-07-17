"use client";

import { useEffect, useState } from "react";
import { TagPicker } from "./TagPicker";
import { useRestaurantUI } from "./AppShell";
import type { RestaurantInput } from "@/lib/types";

export function RestaurantForm({
  initial,
  onSubmit,
  submitLabel = "Save restaurant",
  suggestedTagName,
}: {
  initial: Partial<RestaurantInput>;
  onSubmit: (values: RestaurantInput) => Promise<void>;
  submitLabel?: string;
  suggestedTagName?: string | null;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds ?? []);
  const [areaIds, setAreaIds] = useState<string[]>(initial.areaIds ?? []);
  // City picker is hidden for now (see below) -- carry the existing value through
  // untouched rather than dropping it on save.
  const cityIds = initial.cityId ? [initial.cityId] : [];
  const [primaryTagId, setPrimaryTagId] = useState<string | null>(initial.primary_tag_id ?? null);
  const [address, setAddress] = useState(initial.address ?? "");
  const [lat, setLat] = useState<number | "">(initial.lat ?? "");
  const [lng, setLng] = useState<number | "">(initial.lng ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [priceLevel, setPriceLevel] = useState<number | null>(initial.price_level ?? null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const { tags: tagOptions } = useRestaurantUI();
  const [editingLocation, setEditingLocation] = useState(initial.lat === undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep primaryTagId valid as the tag selection changes: auto-pick when there's
  // exactly one, clear/reassign if the current primary was removed.
  useEffect(() => {
    if (tagIds.length === 0) {
      setPrimaryTagId(null);
    } else if (tagIds.length === 1) {
      setPrimaryTagId(tagIds[0]);
    } else if (primaryTagId && !tagIds.includes(primaryTagId)) {
      setPrimaryTagId(tagIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagIds]);

  const inputClass =
    "rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
  const selectedTagOptions = tagOptions.filter((t) => tagIds.includes(t.id));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !address || lat === "" || lng === "") {
      setError("Name, address and location are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name,
        primary_tag_id: primaryTagId,
        lat: Number(lat),
        lng: Number(lng),
        address,
        phone: phone || null,
        website: website || null,
        price_level: priceLevel,
        opening_hours: initial.opening_hours ?? null,
        google_place_id: initial.google_place_id ?? null,
        notes: notes || null,
        photo_url: initial.photo_url ?? null,
        tagIds,
        areaIds,
        cityId: cityIds[0] ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pr-6">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>

      <TagPicker
        kind="tag"
        label="Tags"
        multiple
        selectedIds={tagIds}
        onChange={setTagIds}
        initialQuery={suggestedTagName ?? undefined}
      />

      {selectedTagOptions.length > 1 && (
        <div className="flex flex-col gap-1.5 text-sm">
          <span>Primary tag (colors the map pin)</span>
          <div className="flex flex-wrap gap-1.5">
            {selectedTagOptions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPrimaryTagId(t.id)}
                className="rounded-full border px-2.5 py-1 text-xs"
                style={
                  primaryTagId === t.id
                    ? { background: t.color ?? undefined, borderColor: t.color ?? undefined, color: "white" }
                    : { borderColor: t.color ?? undefined, color: t.color ?? undefined }
                }
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <TagPicker kind="area" label="Area" multiple selectedIds={areaIds} onChange={setAreaIds} />
      {/* City is hidden for now -- cityIds still round-trips through save unchanged
          (see handleSubmit) so existing data isn't lost, it's just not editable here. */}

      <label className="flex flex-col gap-1 text-sm">
        Address
        <input
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span>Location</span>
          {!editingLocation && (
            <button
              type="button"
              onClick={() => setEditingLocation(true)}
              className="text-xs text-black/60 underline dark:text-white/60"
            >
              Edit
            </button>
          )}
        </div>
        {editingLocation ? (
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="number"
              step="any"
              placeholder="Latitude"
              value={lat}
              onChange={(e) => setLat(e.target.value === "" ? "" : parseFloat(e.target.value))}
              className={inputClass}
            />
            <input
              required
              type="number"
              step="any"
              placeholder="Longitude"
              value={lng}
              onChange={(e) => setLng(e.target.value === "" ? "" : parseFloat(e.target.value))}
              className={inputClass}
            />
          </div>
        ) : (
          <p className="text-black/70 dark:text-white/70">
            {lat}, {lng}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Phone
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Website
        <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Price level
        <select
          value={priceLevel ?? ""}
          onChange={(e) => setPriceLevel(e.target.value ? Number(e.target.value) : null)}
          className={inputClass}
        >
          <option value="">Not set</option>
          <option value="1">$</option>
          <option value="2">$$</option>
          <option value="3">$$$</option>
          <option value="4">$$$$</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="mt-1 rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
