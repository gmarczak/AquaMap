import { describe, expect, it } from "vitest";
import { badges, equipmentBonus, levelInfo, routeProgress, streak, totals } from "./game";
import type { InventoryItem, Item } from "./model";

describe("poziomy (jak swim.level_for)", () => {
  it("progi 200 × poziom", () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, need: 200 });
    expect(levelInfo(199).level).toBe(1);
    expect(levelInfo(200)).toMatchObject({ level: 2, into: 0, need: 400 });
    expect(levelInfo(599).level).toBe(2);
    expect(levelInfo(600).level).toBe(3);
    expect(levelInfo(10_000_000)).toMatchObject({ level: 50, need: 0, pct: 1 });
  });
  it("sumy z księgi", () => {
    expect(totals([{ kind: "workout", xp: 200, coins: 15, workoutId: "a" }, { kind: "purchase", xp: 0, coins: -40, workoutId: null }])).toEqual({ xp: 200, coins: -25 });
  });
});

describe("passa", () => {
  const w = (d: string) => ({ swumOn: d });
  it("liczy kolejne tygodnie, także gdy ten tydzień jeszcze bez treningu", () => {
    // 2026-10-13 to wtorek; tygodnie: 5.10, 28.09, 21.09
    expect(streak([w("2026-10-06"), w("2026-09-30"), w("2026-09-22")], "2026-10-13")).toEqual({ weeks: 3, thisWeekDone: false, bonusPct: 15 });
    expect(streak([w("2026-10-13"), w("2026-10-06")], "2026-10-13")).toEqual({ weeks: 2, thisWeekDone: true, bonusPct: 5 });
  });
  it("przerwa zeruje, max +25%", () => {
    expect(streak([w("2026-09-22")], "2026-10-13").weeks).toBe(0);
    const many = Array.from({ length: 10 }, (_, i) => w(`2026-${String(8 + Math.floor((i * 7 + 3) / 31)).padStart(2, "0")}-01`));
    expect(streak(many, "2026-10-13").bonusPct).toBeLessThanOrEqual(25);
  });
});

describe("wyprawy i odznaki", () => {
  it("trasy wypełniają się po kolei", () => {
    const r = routeProgress(5000);
    expect(r[0]).toMatchObject({ completed: true, doneM: 2400 });
    expect(r[1]).toMatchObject({ active: true, doneM: 2600, completed: false });
    expect(r[2]).toMatchObject({ active: false, doneM: 0 });
  });
  it("odznaki za dystans i wyprawy", () => {
    const b = badges(12500);
    expect(b.filter((x) => x.earned).map((x) => x.id)).toEqual(["fala", "rekin", "route-alcatraz", "route-olimpijski"]);
  });
});

describe("ekwipunek", () => {
  const items: Item[] = [
    { id: "a", name: "A", slot: "cap", rarity: "legendary", bonusKind: "xp", bonusPct: 15, price: 1, description: "", inShop: true, sort: 1 },
    { id: "b", name: "B", slot: "fins", rarity: "legendary", bonusKind: "xp", bonusPct: 15, price: 1, description: "", inShop: true, sort: 2 },
    { id: "c", name: "C", slot: "suit", rarity: "epic", bonusKind: "xp", bonusPct: 10, price: 1, description: "", inShop: true, sort: 3 },
    { id: "d", name: "D", slot: "goggles", rarity: "rare", bonusKind: "coins", bonusPct: 6, price: 1, description: "", inShop: true, sort: 4 },
  ];
  const inv = (itemId: string, equipped = true): InventoryItem => ({ id: itemId, itemId, slot: "cap", source: "shop", workoutId: null, equipped, soldAt: null, acquiredAt: "" });
  it("bonus max 30% dla EXP, osobno monety", () => {
    expect(equipmentBonus([inv("a"), inv("b"), inv("c"), inv("d")], items)).toEqual({ xp: 30, coins: 6 });
    expect(equipmentBonus([inv("a", false)], items)).toEqual({ xp: 0, coins: 0 });
  });
});
