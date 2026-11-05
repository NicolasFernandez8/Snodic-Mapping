export type Niche = {
  key: string;
  label: string;
  google_types: string[];
  keywords: string[];
  osm_tags: { k: string; v: string }[];
  business_label: string;
};

export type LocalityRow = {
  id: number;
  region_id: number;
  name: string;
  osm_id: string | null;
  boundary: import("../geo/geometry").Area | null;
  bbox: [number, number, number, number] | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  status: string;
};

export type ProspectRow = {
  id: number;
  locality_id: number | null;
  niche_key: string | null;
  source: "google_places" | "osm" | "manual";
  source_id: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  instagram: string | null;
  google_maps_url: string | null;
  reviews_url: string | null;
  rating: string | null;
  reviews_count: number | null;
  lat: number | null;
  lng: number | null;
  status: string;
  notion_page_id: string | null;
  notion_blocks: { message?: string[]; report?: string[] };
  raw: Record<string, unknown>;
};

export type AgentLog = (msg: string) => void;
