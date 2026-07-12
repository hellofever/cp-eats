import type { Tag } from "./tags";

export interface OpeningPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

export interface Restaurant {
  id: string;
  name: string;
  primary_tag_id: string | null;
  lat: number;
  lng: number;
  address: string;
  phone: string | null;
  website: string | null;
  price_level: number | null;
  opening_hours: OpeningPeriod[] | null;
  google_place_id: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;

  // Derived from the restaurant_tags join + primary_tag_id -- not raw columns.
  // See lib/restaurants.ts for how these get assembled from the Supabase query.
  primaryTag: Tag | null;
  tags: Tag[];
  areas: Tag[];
  city: Tag | null;
}

// Shape used for create/update -- scalar fields plus tag selections as plain id
// arrays/values, which lib/restaurants.ts syncs into restaurant_tags separately.
export interface RestaurantInput {
  name: string;
  primary_tag_id: string | null;
  lat: number;
  lng: number;
  address: string;
  phone: string | null;
  website: string | null;
  price_level: number | null;
  opening_hours: OpeningPeriod[] | null;
  google_place_id: string | null;
  notes: string | null;
  photo_url: string | null;
  tagIds: string[];
  areaIds: string[];
  cityId: string | null;
}
