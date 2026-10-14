import { addDays, startOfWeek, type LocalDate } from "./dates";
import type { InventoryItem, Item, Reward, Workout } from "./model";

export const MAX_LEVEL = 50;

/** Poziom z łącznego EXP — ta sama reguła co swim.level_for: do kolejnego poziomu 200 × poziom. */
export function levelInfo(totalXp: number): { level: number; into: number; need: number; pct: number } {
  let level = 1;
  let left = Math.max(0, totalXp);
  while (level < MAX_LEVEL && left >= 200 * level) {
    left -= 200 * level;
    level++;
  }
  const need = level >= MAX_LEVEL ? 0 : 200 * level;
  return { level, into: level >= MAX_LEVEL ? 0 : left, need, pct: need === 0 ? 1 : left / need };
}

export function totals(rewards: readonly Reward[]): { xp: number; coins: number } {
  let xp = 0;
  let coins = 0;
  for (const r of rewards) {
    xp += r.xp;
    coins += r.coins;
  }
  return { xp, coins };
}

/**
 * Passa: kolejne tygodnie (pon–nd) z co najmniej jednym treningiem.
 * Trwa, jeśli trening był w tym albo w poprzednim tygodniu (ten tydzień jeszcze można uratować).
 */
export function streak(workouts: readonly Pick<Workout, "swumOn">[], today: LocalDate): { weeks: number; thisWeekDone: boolean; bonusPct: number } {
  const weeks = new Set(workouts.map((w) => startOfWeek(w.swumOn)));
  const thisWeek = startOfWeek(today);
  const thisWeekDone = weeks.has(thisWeek);
  let cursor = thisWeekDone ? thisWeek : addDays(thisWeek, -7);
  let count = 0;
  while (weeks.has(cursor)) {
    count++;
    cursor = addDays(cursor, -7);
  }
  // bonus naliczany przy następnym treningu w tym tygodniu: tydzień dzisiejszy liczy się do passy
  const next = thisWeekDone ? count : count + 1;
  return { weeks: count, thisWeekDone, bonusPct: Math.min(5 * Math.max(next - 1, 0), 25) };
}

export type WeekStats = { distanceM: number; sessions: number; durationS: number };

export function weekStats(workouts: readonly Workout[], today: LocalDate): WeekStats {
  const from = startOfWeek(today);
  const to = addDays(from, 6);
  const mine = workouts.filter((w) => w.swumOn >= from && w.swumOn <= to);
  return {
    distanceM: mine.reduce((s, w) => s + w.distanceM, 0),
    sessions: mine.length,
    durationS: mine.reduce((s, w) => s + w.durationS, 0),
  };
}

/** Najlepsze tempo na treningach ≥ 400 m (jak rekord w bazie). */
export function bestPace(workouts: readonly Workout[]): Workout | null {
  let best: Workout | null = null;
  for (const w of workouts) {
    if (w.distanceM < 400) continue;
    if (!best || w.durationS / w.distanceM < best.durationS / best.distanceM) best = w;
  }
  return best;
}

// ============ ODZNAKI I WYPRAWY (liczone z łącznego dystansu) ============

export type Route = { id: string; name: string; description: string; distanceM: number; badge: string };

export const ROUTES: Route[] = [
  { id: "alcatraz", name: "Ucieczka z Alcatraz", description: "Z więziennej wyspy do San Francisco.", distanceM: 2400, badge: "Uciekinier z Alcatraz" },
  { id: "olimpijski", name: "Olimpijski maraton pływacki", description: "Oficjalny dystans maratonu na wodach otwartych.", distanceM: 10000, badge: "Olimpijczyk" },
  { id: "gibraltar", name: "Cieśnina Gibraltarska", description: "Z Europy do Afryki, z Atlantyku na Morze Śródziemne.", distanceM: 14000, badge: "Władca Gibraltaru" },
  { id: "la-manche", name: "Kanał La Manche", description: "Najsłynniejsze wyzwanie pływackie: z Anglii do Francji.", distanceM: 34000, badge: "Pogromca Kanału" },
];

export type RouteProgress = Route & { doneM: number; completed: boolean; active: boolean };

/** Wyprawy po kolei: dystans z każdego treningu wypełnia najpierw pierwszą trasę, potem następną. */
export function routeProgress(totalM: number): RouteProgress[] {
  let left = totalM;
  let activeFound = false;
  return ROUTES.map((r) => {
    const doneM = Math.max(0, Math.min(r.distanceM, left));
    left -= r.distanceM;
    const completed = doneM >= r.distanceM;
    const active = !completed && !activeFound;
    if (active) activeFound = true;
    return { ...r, doneM, completed, active };
  });
}

export type Badge = { id: string; name: string; requirement: string; earned: boolean };

const DISTANCE_BADGES: { id: string; name: string; m: number }[] = [
  { id: "fala", name: "Pierwsza Fala", m: 1000 },
  { id: "rekin", name: "Rekin Basenu", m: 10000 },
  { id: "wytrwalosc", name: "Mistrz Wytrwałości", m: 50000 },
  { id: "legenda", name: "Legenda Głębin", m: 100000 },
  { id: "ocean", name: "Pływak Oceaniczny", m: 250000 },
];

export function badges(totalM: number): Badge[] {
  const routes = routeProgress(totalM);
  return [
    ...DISTANCE_BADGES.map((b) => ({ id: b.id, name: b.name, requirement: `${b.m / 1000} km łącznie`, earned: totalM >= b.m })),
    ...routes.map((r) => ({ id: `route-${r.id}`, name: r.badge, requirement: `Wyprawa: ${r.name}`, earned: r.completed })),
  ];
}

// ============ EKWIPUNEK ============

/** Bonusy z założonych przedmiotów, jak w bazie: suma % osobno dla EXP i monet, każda max 30%. */
export function equipmentBonus(inventory: readonly InventoryItem[], items: readonly Item[]): { xp: number; coins: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  let xp = 0;
  let coins = 0;
  for (const inv of inventory) {
    if (!inv.equipped || inv.soldAt) continue;
    const item = byId.get(inv.itemId);
    if (!item) continue;
    if (item.bonusKind === "xp") xp += item.bonusPct;
    else coins += item.bonusPct;
  }
  return { xp: Math.min(xp, 30), coins: Math.min(coins, 30) };
}

export const SELL_VALUE = { common: 10, rare: 50, epic: 200, legendary: 1000 } as const;
