export type Lang = "zh" | "en";
export type Bilingual = { zh: string; en: string };

export interface Zone {
  id: string;
  color: string;
  ground: boolean; // true = drawn below the ground line (the "roots")
  name: Bilingual;
  description: Bilingual;
}

export interface Layer {
  id: string; // "L0".."L9"
  zone: string;
  name: Bilingual;
}

export interface Branch {
  id: string;
  layer: string;
  name: Bilingual;
  /** Set on sub-branches: they merge into the parent lane until the deepest zoom level. */
  parent?: string;
  color?: string;
}

export interface Tag {
  id: string;
  name: Bilingual;
}

export interface Taxonomy {
  zones: Zone[];
  layers: Layer[];
  branches: Branch[];
  tags: Tag[];
  criteria: Record<string, Bilingual>;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  place: Bilingual;
  /** origin (default) or target; targets get an arc from the origins. */
  role?: "origin" | "target";
}

export type Kind = "paper" | "release" | "event" | "constraint" | "upcoming";
export type Level = 1 | 2 | 3;

export interface TechNode {
  id: string;
  date: string; // YYYY | YYYY-MM | YYYY-MM-DD
  branch: string;
  parents: string[];
  level: Level;
  kind: Kind;
  title: Bilingual;
  summary: Bilingual;
  source?: string | Bilingual;
  url?: string;
  criteria: string[];
  tags?: string[];
  status: "verified" | "candidate";
  added_by?: "human" | "agent";
  added_at?: string;
  confidence?: number;
  agent_reason?: Bilingual;
  geo?: GeoPoint[];
}

export type TimeMode = "focus" | "linear";
/** 0 = overview (zones, milestones), 1 = layers and branches, 2 = sub-branches and detail nodes. */
export type Lod = 0 | 1 | 2;
