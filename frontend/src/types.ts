export type Language = "en" | "hi";

export type PlaceCategory = "hidden_gem" | "food" | "culture" | "experience";

export type PlaceCopy = {
  title: string;
  summary: string;
  story: string;
  tips: string[];
};

export type PlaceGeo = {
  lat: number | null;
  lng: number | null;
};

export type PlaceTheme = {
  primary: string;
  secondary: string;
  on_primary?: string;
};

export type ProvenanceSource = {
  name: string;
  url: string;
  type: string;
};

export type Enrichment = {
  osm?: { url?: string; note?: string; opening_hours?: string; address?: string; phone?: string; wheelchair?: string; source?: string; license?: string };
  wikivoyage?: { url?: string; note?: string; extract?: string; source?: string; license?: string };
  fetched_at?: string;
};

export type Place = {
  id: string;
  slug: string;
  status?: "draft" | "ready" | "hold";
  category: PlaceCategory;
  tags: string[];
  geo: PlaceGeo;
  is_anchor: boolean;
  anchor_for: string[];
  i18n: Record<Language, PlaceCopy>;
  theme?: PlaceTheme;
  media: {
    images: Array<{
      id: string;
      file: string;
      thumb: string;
      alt: Record<Language, string>;
      credit?: string | null;
    }>;
    placeholder?: boolean;
    video?: { url: string; poster: string; offline: boolean };
  };
  hours: string | null;
  best_time: string | null;
  cost_note: string | null;
  sensitivity: { is_sacred: boolean; note: string | null };
  partner_id?: string;
  enrichment: Enrichment;
  provenance: {
    source: string;
    license: string;
    verified_by: string;
    verified_at: string;
    sources?: ProvenanceSource[];
    geo_attribution?: string;
  };
  updated_in_version: number;
  deleted?: boolean;
};

export type Partner = {
  id: string;
  type: "board" | "homestay" | "food" | "experience" | "artisan" | "performer" | "vendor";
  name: string;
  contact: { phone?: string; whatsapp?: string; email?: string };
  place_ids: string[];
  offer: string;
  i18n: Record<Language, { name: string; offer: string; description: string }>;
  featured_until?: string;
  onboarded_via: string;
};

export type Event = {
  id: string;
  type: "view" | "save" | "directions" | "enquiry" | "nudge_click";
  place_id: string;
  partner_id?: string;
  ts: string;
  session_id: string;
};

export type Manifest = {
  version: number;
  built_at: string;
  min_app_version: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  languages: Language[];
  total_bytes: number;
};

export type Delta = {
  from: number;
  to: number;
  places: Place[];
  partners: Partner[];
  text: Record<string, Partial<Record<Language, PlaceCopy>>>;
  deleted_ids: string[];
};

export type PartnerApplication = {
  id: string;
  name: string;
  type: Partner["type"];
  contact: string;
  offer: string;
  place_ids: string[];
  created_at: string;
};

export type Enquiry = {
  id: string;
  partner_id: string;
  place_id?: string;
  name: string;
  contact: string;
  message: string;
  created_at: string;
};

export type OutboxItem = {
  id?: number;
  idempotency_id: string;
  kind: "event" | "partner_application" | "enquiry";
  payload: Event | PartnerApplication | Enquiry;
  created_at: string;
  retry_at: number;
  attempts: number;
};

export type PackPayload = {
  places: Place[];
  partners: Partner[];
  text: Record<string, Partial<Record<Language, PlaceCopy>>>;
  searchIndex: { fields: string[]; searchFields: string[] };
};

export type DiscoveryRecord = {
  placeId: string;
  category: PlaceCategory;
  isAnchor: boolean;
  xp: number;
  discoveredAt: string;
};

export type DiscoveryStats = {
  totalXp: number;
  hiddenGemsCount: number;
  totalDiscoveries: number;
  lastExplorationAt: string | null;
};

export type CityConfig = {
  id: string;
  name: Record<Language, string>;
  tagline: Record<Language, string>;
  country: string;
  center: [number, number];
  bounds: PackBounds;
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  languages: Language[];
};

export type AppConnectivity = "OFFLINE" | "ONLINE_IDLE" | "SYNCING";

export type PackBounds = { west: number; south: number; east: number; north: number };
