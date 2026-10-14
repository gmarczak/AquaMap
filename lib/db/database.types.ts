// Typy schematu `swim` (wspólny projekt Supabase z Nawykami, Finansami i Garażem). Odpowiadają migracjom w supabase/migrations.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Enums = {
  source: "manual" | "strava" | "garmin";
  stroke: "free" | "back" | "breast" | "fly" | "im" | "kick" | "pull" | "mixed";
  rarity: "common" | "rare" | "epic" | "legendary";
  slot: "goggles" | "cap" | "fins" | "suit" | "paddles" | "buoy";
};

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type PoolRow = {
  id: number;
  osm_id: string | null;
  name: string;
  city: string | null;
  street: string | null;
  lat: number;
  lng: number;
  kind: "pool" | "sports_centre" | "water_park";
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  length_m: number | null;
  lanes: number | null;
  hidden: boolean;
  updated_at: string;
};
export type LaneScheduleRow = { id: number; pool_id: number; weekday: number; starts: string; ends: string; lane: number | null; label: string | null };
export type SettingsRow = { user_id: string; timezone: string; default_pool_id: number | null; default_length_m: number; created_at: string };
export type WorkoutRow = {
  id: string;
  user_id: string;
  swum_on: string;
  distance_m: number;
  duration_s: number;
  pool_id: number | null;
  pool_length_m: number | null;
  mood: number | null;
  note: string | null;
  source: Enums["source"];
  external_id: string | null;
  created_at: string;
};
export type WorkoutSetRow = {
  id: string;
  workout_id: string;
  user_id: string;
  position: number;
  reps: number;
  distance_m: number;
  stroke: Enums["stroke"];
  rest_s: number | null;
};
export type ItemRow = {
  id: string;
  name: string;
  slot: Enums["slot"];
  rarity: Enums["rarity"];
  bonus_kind: "xp" | "coins";
  bonus_pct: number;
  price: number;
  description: string;
  in_shop: boolean;
  sort: number;
};
export type InventoryRow = {
  id: string;
  user_id: string;
  item_id: string;
  slot: Enums["slot"];
  source: "loot" | "level" | "shop" | "quest";
  workout_id: string | null;
  equipped: boolean;
  sold_at: string | null;
  acquired_at: string;
};
export type RewardRow = {
  id: number;
  user_id: string;
  kind: "workout" | "record" | "quest" | "purchase" | "sale";
  xp: number;
  coins: number;
  workout_id: string | null;
  inventory_id: string | null;
  quest_id: string | null;
  week: string | null;
  created_at: string;
};
export type QuestRowOut = {
  id: string;
  title: string;
  kind: "distance" | "sessions" | "long" | "sets";
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  claimed: boolean;
  week: string;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  swim: {
    Tables: {
      pools: Table<PoolRow, "name" | "lat" | "lng">;
      lane_schedules: Table<LaneScheduleRow, "pool_id" | "weekday" | "starts" | "ends">;
      settings: Table<SettingsRow, never>;
      workouts: Table<WorkoutRow, "swum_on" | "distance_m" | "duration_s">;
      workout_sets: Table<WorkoutSetRow, "workout_id" | "position" | "reps" | "distance_m">;
      items: Table<ItemRow, "id" | "name" | "slot" | "rarity" | "bonus_kind" | "bonus_pct" | "price">;
      inventory: Table<InventoryRow, "item_id" | "slot" | "source">;
      rewards: Table<RewardRow, "user_id" | "kind">;
    };
    Views: { [_ in never]: never };
    Functions: {
      bootstrap: { Args: never; Returns: undefined };
      log_workout: {
        Args: {
          p_id: string;
          p_swum_on: string;
          p_distance_m: number;
          p_duration_s: number;
          p_pool_id?: number | null;
          p_pool_length_m?: number | null;
          p_mood?: number | null;
          p_note?: string | null;
          p_sets?: Json;
        };
        Returns: Json;
      };
      buy_item: { Args: { p_item: string }; Returns: string };
      sell_item: { Args: { p_inventory: string }; Returns: number };
      equip_item: { Args: { p_inventory: string; p_equip?: boolean }; Returns: undefined };
      week_quests: { Args: { p_week?: string | null }; Returns: QuestRowOut[] };
      claim_quest: { Args: { p_quest: string; p_week: string }; Returns: Json };
      my_integrations: { Args: never; Returns: { provider: string; athlete_id: number; connected_at: string; last_sync_at: string | null }[] };
      disconnect: { Args: { p_provider: string }; Returns: undefined };
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
};
