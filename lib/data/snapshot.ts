import type { Supabase } from "@/lib/db/client";
import type { InventoryRow, ItemRow, PoolRow, QuestRowOut, RewardRow, WorkoutRow, WorkoutSetRow } from "@/lib/db/database.types";
import { addDays } from "@/lib/domain/dates";
import type { Integration, InventoryItem, Item, Pool, Quest, Reward, Settings, Workout } from "@/lib/domain/model";

/** Dane gracza w jednym obiekcie w cache (IndexedDB). Baseny są osobno (wspólne, duże, rzadko się zmieniają). */
export type Snapshot = {
  userId: string;
  email: string | null;
  settings: Settings;
  workouts: Workout[];
  items: Item[];
  inventory: InventoryItem[];
  rewards: Reward[];
  quests: Quest[];
  integrations: Integration[];
};

export function toWorkout(r: WorkoutRow, sets: WorkoutSetRow[]): Workout {
  return {
    id: r.id,
    swumOn: r.swum_on,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    poolId: r.pool_id,
    poolLengthM: r.pool_length_m,
    mood: r.mood,
    note: r.note,
    source: r.source,
    createdAt: r.created_at,
    sets: sets
      .filter((s) => s.workout_id === r.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ reps: s.reps, distanceM: s.distance_m, stroke: s.stroke, restS: s.rest_s })),
  };
}

export function toItem(r: ItemRow): Item {
  return { id: r.id, name: r.name, slot: r.slot, rarity: r.rarity, bonusKind: r.bonus_kind, bonusPct: r.bonus_pct, price: r.price, description: r.description, inShop: r.in_shop, sort: r.sort };
}

export function toInventory(r: InventoryRow): InventoryItem {
  return { id: r.id, itemId: r.item_id, slot: r.slot, source: r.source, workoutId: r.workout_id, equipped: r.equipped, soldAt: r.sold_at, acquiredAt: r.acquired_at };
}

export function toReward(r: Pick<RewardRow, "kind" | "xp" | "coins" | "workout_id">): Reward {
  return { kind: r.kind, xp: r.xp, coins: r.coins, workoutId: r.workout_id };
}

export function toQuest(r: QuestRowOut): Quest {
  return { id: r.id, title: r.title, kind: r.kind, target: r.target, progress: r.progress, rewardXp: r.reward_xp, rewardCoins: r.reward_coins, claimed: r.claimed, week: r.week };
}

export function toPool(r: Omit<PoolRow, "hidden" | "updated_at">): Pool {
  return {
    id: r.id,
    osmId: r.osm_id,
    name: r.name,
    city: r.city,
    street: r.street,
    lat: r.lat,
    lng: r.lng,
    kind: r.kind,
    website: r.website,
    phone: r.phone,
    openingHours: r.opening_hours,
    lengthM: r.length_m,
    lanes: r.lanes,
  };
}

/** PostgREST oddaje najwyżej 1000 wierszy naraz — dociągamy stronami. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function fetchSnapshot(supabase: Supabase): Promise<Snapshot> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("not_authenticated");

  let settings = await supabase.from("settings").select("*").maybeSingle();
  if (settings.error) throw settings.error;
  if (!settings.data) {
    const boot = await supabase.rpc("bootstrap");
    if (boot.error) throw boot.error;
    settings = await supabase.from("settings").select("*").maybeSingle();
    if (settings.error) throw settings.error;
  }

  const [workouts, sets, items, inventory, rewards, quests, integrations] = await Promise.all([
    all<WorkoutRow>((a, b) => supabase.from("workouts").select("*").order("swum_on", { ascending: false }).order("created_at", { ascending: false }).range(a, b)),
    all<WorkoutSetRow>((a, b) => supabase.from("workout_sets").select("*").order("id").range(a, b)),
    supabase.from("items").select("*").order("sort"),
    all<InventoryRow>((a, b) => supabase.from("inventory").select("*").is("sold_at", null).order("acquired_at", { ascending: false }).range(a, b)),
    all<Pick<RewardRow, "kind" | "xp" | "coins" | "workout_id">>((a, b) => supabase.from("rewards").select("kind, xp, coins, workout_id").order("id").range(a, b)),
    supabase.rpc("week_quests", {}),
    supabase.rpc("my_integrations"),
  ]);
  for (const r of [items, quests, integrations]) if (r.error) throw r.error;

  // Nieodebrane, ukończone questy z zeszłego tygodnia (można je odebrać jeszcze przez tydzień)
  const thisWeek = quests.data?.[0]?.week;
  let lastWeek: QuestRowOut[] = [];
  if (thisWeek) {
    const prev = await supabase.rpc("week_quests", { p_week: addDays(thisWeek, -7) });
    if (prev.error) throw prev.error;
    lastWeek = (prev.data ?? []).filter((q) => !q.claimed && q.progress >= q.target);
  }

  const s = settings.data;
  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    settings: { timezone: s?.timezone ?? "Europe/Warsaw", defaultPoolId: s?.default_pool_id ?? null, defaultLengthM: s?.default_length_m ?? 25 },
    workouts: workouts.map((w) => toWorkout(w, sets)),
    items: (items.data ?? []).map(toItem),
    inventory: inventory.map(toInventory),
    rewards: rewards.map(toReward),
    quests: [...(quests.data ?? []), ...lastWeek].map(toQuest),
    integrations: (integrations.data ?? []).map((i) => ({ provider: "strava" as const, athleteId: i.athlete_id, connectedAt: i.connected_at, lastSyncAt: i.last_sync_at })),
  };
}

export async function fetchPools(supabase: Supabase): Promise<Pool[]> {
  const rows = await all<Omit<PoolRow, "hidden" | "updated_at">>((a, b) =>
    supabase.from("pools").select("id, osm_id, name, city, street, lat, lng, kind, website, phone, opening_hours, length_m, lanes").order("id").range(a, b),
  );
  return rows.map(toPool);
}
