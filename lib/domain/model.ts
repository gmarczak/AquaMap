import type { LocalDate } from "./dates";

export type Stroke = "free" | "back" | "breast" | "fly" | "im" | "kick" | "pull" | "mixed";
export const STROKES: Stroke[] = ["free", "back", "breast", "fly", "im", "kick", "pull", "mixed"];
export const STROKE_LABELS: Record<Stroke, string> = {
  free: "Kraul",
  back: "Grzbiet",
  breast: "Żabka",
  fly: "Motyl",
  im: "Zmienny",
  kick: "Nogi",
  pull: "Ręce",
  mixed: "Mieszany",
};

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITY_LABELS: Record<Rarity, string> = { common: "Zwykły", rare: "Rzadki", epic: "Epicki", legendary: "Legendarny" };
export const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];

export type Slot = "goggles" | "cap" | "fins" | "suit" | "paddles" | "buoy";
export const SLOTS: Slot[] = ["goggles", "cap", "suit", "fins", "paddles", "buoy"];
export const SLOT_LABELS: Record<Slot, string> = {
  goggles: "Gogle",
  cap: "Czepek",
  fins: "Płetwy",
  suit: "Strój",
  paddles: "Łapki",
  buoy: "Sprzęt",
};

export type PoolKind = "pool" | "sports_centre" | "water_park";
export const POOL_KIND_LABELS: Record<PoolKind, string> = { pool: "Basen", sports_centre: "Pływalnia / centrum sportu", water_park: "Aquapark" };

export type Pool = {
  id: number;
  osmId: string | null;
  name: string;
  city: string | null;
  street: string | null;
  lat: number;
  lng: number;
  kind: PoolKind;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  lengthM: number | null;
  lanes: number | null;
};

export type LaneSlot = { weekday: number; starts: string; ends: string; lane: number | null; label: string | null };

export type WorkoutSet = { reps: number; distanceM: number; stroke: Stroke; restS: number | null };

export type Source = "manual" | "strava" | "garmin";

export type Workout = {
  id: string;
  swumOn: LocalDate;
  distanceM: number;
  durationS: number;
  poolId: number | null;
  poolLengthM: number | null;
  mood: number | null;
  note: string | null;
  source: Source;
  sets: WorkoutSet[];
  createdAt: string;
  /** zapisany lokalnie, czeka na wysłanie (offline) */
  pending?: boolean;
};

export type Item = {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  bonusKind: "xp" | "coins";
  bonusPct: number;
  price: number;
  description: string;
  inShop: boolean;
  sort: number;
};

export type InventoryItem = {
  id: string;
  itemId: string;
  slot: Slot;
  source: "loot" | "level" | "shop" | "quest";
  workoutId: string | null;
  equipped: boolean;
  soldAt: string | null;
  acquiredAt: string;
};

export type Reward = { kind: "workout" | "record" | "quest" | "purchase" | "sale"; xp: number; coins: number; workoutId: string | null };

export type Quest = {
  id: string;
  title: string;
  kind: "distance" | "sessions" | "long" | "sets";
  target: number;
  progress: number;
  rewardXp: number;
  rewardCoins: number;
  claimed: boolean;
  week: LocalDate;
};

export type Integration = { provider: "strava"; athleteId: number; connectedAt: string; lastSyncAt: string | null };

export type Settings = { timezone: string; defaultPoolId: number | null; defaultLengthM: number };

/** Wynik zapisu treningu z bazy (swim.workout_summary). */
export type WorkoutSummary = {
  workout_id: string;
  xp: number;
  coins: number;
  record: boolean;
  rewarded: boolean;
  level_before: number;
  level_after: number;
  items: { id: string; item_id: string; source: string }[];
};

export const MOODS: { value: number; label: string }[] = [
  { value: 1, label: "Ciężko" },
  { value: 2, label: "Słabo" },
  { value: 3, label: "Ok" },
  { value: 4, label: "Dobrze" },
  { value: 5, label: "Świetnie" },
];
