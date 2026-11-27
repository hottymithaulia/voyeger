import Dexie, { type Table } from "dexie";

import type { DiscoveryRecord, Event, OutboxItem, Partner, Place } from "@/types";

export type PlaceTextRecord = {
  placeId: string;
  lang: "en" | "hi";
  title: string;
  summary: string;
  story: string;
  tips: string[];
};

export type MediaMetaRecord = {
  id: string;
  place_id: string;
  file: string;
  bytes?: number;
  verified_at?: string;
};

export type SavedRecord = { placeId: string; saved_at: string };
export type MetaRecord = { key: string; value: unknown };

export class VoyegerDatabase extends Dexie {
  places!: Table<Place, string>;
  partners!: Table<Partner, string>;
  text!: Table<PlaceTextRecord, [string, string]>;
  media_meta!: Table<MediaMetaRecord, string>;
  meta!: Table<MetaRecord, string>;
  outbox!: Table<OutboxItem, number>;
  saved!: Table<SavedRecord, string>;
  events!: Table<Event, string>;
  discoveries!: Table<DiscoveryRecord, string>;

  constructor() {
    super("voyeger-bhopal");
    this.version(1).stores({
      places: "id, slug, category, deleted, partner_id, *tags",
      partners: "id, type",
      text: "[placeId+lang], placeId, lang",
      media_meta: "id, place_id",
      meta: "key",
      outbox: "++id, idempotency_id, kind, created_at, retry_at",
      saved: "placeId, saved_at",
      events: "id, type, ts",
    });
    this.version(2).stores({
      places: "id, slug, category, deleted, partner_id, *tags",
      partners: "id, type",
      text: "[placeId+lang], placeId, lang",
      media_meta: "id, place_id",
      meta: "key",
      outbox: "++id, idempotency_id, kind, created_at, retry_at",
      saved: "placeId, saved_at",
      events: "id, type, ts",
      discoveries: "placeId, category, isAnchor, discoveredAt",
    });
  }
}

export const db = new VoyegerDatabase();
