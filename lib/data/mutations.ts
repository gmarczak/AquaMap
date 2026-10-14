import type { Supabase } from "@/lib/db/client";
import type { LocalDate } from "@/lib/domain/dates";
import type { Quest, Stroke, Workout, WorkoutSummary } from "@/lib/domain/model";
import type { Snapshot } from "./snapshot";

export function newId(): string {
  return crypto.randomUUID();
}

const NETWORK = /Failed to fetch|NetworkError|network|Load failed|fetch failed/i;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
}

/** Błąd sieci (brak zasięgu), a nie odmowa serwera. */
export function isNetworkError(error: unknown): boolean {
  return NETWORK.test(messageOf(error));
}

const KNOWN: Record<string, string> = {
  too_fast: "Tempo szybsze niż 1:00/100 m — sprawdź dystans i czas.",
  too_long: "Najwyżej 10 km i 4 godziny na jeden trening.",
  future_date: "Trening nie może być z przyszłości.",
  too_old: "Ręcznie można dodać trening najwyżej 14 dni wstecz.",
  coins_spent: "Monety z tego treningu są już wydane — nie można go usunąć.",
  not_authenticated: "Sesja wygasła — zaloguj się ponownie.",
  too_many_sets: "Najwyżej 40 serii.",
  not_enough_coins: "Za mało monet.",
  item_not_sellable: "Tego przedmiotu nie można sprzedać (zdejmij go najpierw).",
  item_not_found: "Nie znaleziono przedmiotu — odśwież aplikację.",
  quest_claimed: "Nagroda już odebrana.",
  quest_not_done: "Quest jeszcze nie ukończony.",
  quest_expired: "Ten tydzień już minął.",
};

/** Komunikat dla człowieka z błędu Supabase/RPC. */
export function errorMessage(error: unknown): string {
  const message = messageOf(error);
  if (NETWORK.test(message)) return "Brak połączenia. Spróbuj, gdy wróci internet.";
  for (const [code, text] of Object.entries(KNOWN)) if (message.includes(code)) return text;
  if (/check constraint|violates/i.test(message)) return "Któraś wartość jest poza zakresem — sprawdź pola formularza.";
  return message;
}

function check<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

// ============ TRENINGI ============

export type WorkoutDraft = {
  id: string;
  /** właściciel szkicu: po zmianie konta zaległe szkice poprzedniego nie są wysyłane */
  userId: string;
  swumOn: LocalDate;
  distanceM: number;
  durationS: number;
  poolId: number | null;
  poolLengthM: number | null;
  mood: number | null;
  note: string | null;
  sets: { reps: number; distanceM: number; stroke: Stroke; restS: number | null }[];
};

/** Zapis treningu (działa też z kolejki offline: id nadaje klient, powtórka zwraca te same nagrody). */
export async function logWorkout(supabase: Supabase, d: WorkoutDraft): Promise<WorkoutSummary> {
  const { data } = check(
    await supabase.rpc("log_workout", {
      p_id: d.id,
      p_swum_on: d.swumOn,
      p_distance_m: d.distanceM,
      p_duration_s: d.durationS,
      p_pool_id: d.poolId,
      p_pool_length_m: d.poolLengthM,
      p_mood: d.mood,
      p_note: d.note?.trim() || null,
      p_sets: d.sets.map((s) => ({ reps: s.reps, distance_m: s.distanceM, stroke: s.stroke, rest_s: s.restS })),
    }),
  );
  return data as unknown as WorkoutSummary;
}

export function withWorkout(snapshot: Snapshot, d: WorkoutDraft): Snapshot {
  const { userId: _owner, ...rest } = d;
  // eslint-disable-next-line no-restricted-syntax -- znacznik czasu, nie dzień
  const w: Workout = { ...rest, source: "manual", createdAt: new Date().toISOString(), pending: true };
  const workouts = [w, ...snapshot.workouts.filter((x) => x.id !== d.id)].sort((a, b) => (a.swumOn < b.swumOn ? 1 : a.swumOn > b.swumOn ? -1 : 0));
  return { ...snapshot, workouts };
}

export async function updateWorkout(supabase: Supabase, input: { id: string; mood: number | null; note: string | null; poolId: number | null }): Promise<void> {
  check(await supabase.from("workouts").update({ mood: input.mood, note: input.note?.trim() || null, pool_id: input.poolId }).eq("id", input.id));
}

export function withWorkoutMeta(snapshot: Snapshot, input: { id: string; mood: number | null; note: string | null; poolId: number | null }): Snapshot {
  return { ...snapshot, workouts: snapshot.workouts.map((w) => (w.id === input.id ? { ...w, mood: input.mood, note: input.note?.trim() || null, poolId: input.poolId } : w)) };
}

/** Usunięcie treningu zdejmuje też jego EXP, monety i zdobyte w nim przedmioty. */
export async function deleteWorkout(supabase: Supabase, id: string): Promise<void> {
  check(await supabase.from("workouts").delete().eq("id", id));
}

export function withoutWorkout(snapshot: Snapshot, id: string): Snapshot {
  return {
    ...snapshot,
    workouts: snapshot.workouts.filter((w) => w.id !== id),
    rewards: snapshot.rewards.filter((r) => r.workoutId !== id),
    inventory: snapshot.inventory.filter((i) => i.workoutId !== id),
  };
}

// ============ SKLEP, EKWIPUNEK, QUESTY ============

export async function buyItem(supabase: Supabase, itemId: string): Promise<void> {
  check(await supabase.rpc("buy_item", { p_item: itemId }));
}

export async function sellItem(supabase: Supabase, inventoryId: string): Promise<void> {
  check(await supabase.rpc("sell_item", { p_inventory: inventoryId }));
}

export async function equipItem(supabase: Supabase, input: { id: string; equip: boolean }): Promise<void> {
  check(await supabase.rpc("equip_item", { p_inventory: input.id, p_equip: input.equip }));
}

export function withEquipped(snapshot: Snapshot, input: { id: string; equip: boolean }): Snapshot {
  const target = snapshot.inventory.find((i) => i.id === input.id);
  if (!target) return snapshot;
  return {
    ...snapshot,
    inventory: snapshot.inventory.map((i) =>
      i.id === input.id ? { ...i, equipped: input.equip } : input.equip && i.slot === target.slot ? { ...i, equipped: false } : i,
    ),
  };
}

export type ClaimResult = { xp: number; coins: number; level_before: number; level_after: number; items: { id: string; item_id: string; source: string }[] };

export async function claimQuest(supabase: Supabase, quest: Pick<Quest, "id" | "week">): Promise<ClaimResult> {
  const { data } = check(await supabase.rpc("claim_quest", { p_quest: quest.id, p_week: quest.week }));
  return data as unknown as ClaimResult;
}

// ============ USTAWIENIA I INTEGRACJE ============

export async function saveSettings(supabase: Supabase, input: { defaultPoolId?: number | null; defaultLengthM?: number }): Promise<void> {
  const row: { default_pool_id?: number | null; default_length_m?: number } = {};
  if (input.defaultPoolId !== undefined) row.default_pool_id = input.defaultPoolId;
  if (input.defaultLengthM !== undefined) row.default_length_m = input.defaultLengthM;
  const { data: auth } = await supabase.auth.getUser();
  check(await supabase.from("settings").update(row).eq("user_id", auth.user?.id ?? ""));
}

export function withSettings(snapshot: Snapshot, input: { defaultPoolId?: number | null; defaultLengthM?: number }): Snapshot {
  return {
    ...snapshot,
    settings: {
      ...snapshot.settings,
      ...(input.defaultPoolId !== undefined && { defaultPoolId: input.defaultPoolId }),
      ...(input.defaultLengthM !== undefined && { defaultLengthM: input.defaultLengthM }),
    },
  };
}

export async function disconnectStrava(supabase: Supabase): Promise<void> {
  check(await supabase.rpc("disconnect", { p_provider: "strava" }));
}
