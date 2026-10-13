import { describe, expect, it } from "vitest";
import { hoursRows, isOpenAt, openStatus, parseOpeningHours, weekdayIndex } from "./hours";

describe("godziny OSM", () => {
  it("typowe zapisy", () => {
    const w = parseOpeningHours("Mo-Fr 06:00-22:00; Sa,Su 08:00-20:00")!;
    expect(hoursRows(w)).toEqual([
      { days: "Pn–Pt", hours: "6:00–22:00", indices: [0, 1, 2, 3, 4] },
      { days: "Sb–Nd", hours: "8:00–20:00", indices: [5, 6] },
    ]);
    expect(isOpenAt(w, 0, 6 * 60)).toBe(true);
    expect(isOpenAt(w, 6, 7 * 60)).toBe(false);
  });
  it("24/7, przerwy, off, nadpisanie i święta", () => {
    expect(hoursRows(parseOpeningHours("24/7")!)).toEqual([{ days: "Pn–Nd", hours: "całą dobę", indices: [0, 1, 2, 3, 4, 5, 6] }]);
    const w = parseOpeningHours("Mo-Su 06:00-08:00,15:00-22:00; Su off; PH 10:00-18:00")!;
    expect(w[0]).toEqual([{ from: 360, to: 480 }, { from: 900, to: 1320 }]);
    expect(w[6]).toEqual([]);
    expect(parseOpeningHours("06:00-22:00")![3]).toEqual([{ from: 360, to: 1320 }]);
  });
  it("nieznane formaty → null", () => {
    expect(parseOpeningHours("Jan-Mar Mo-Fr 08:00-16:00")).toBeNull();
    expect(parseOpeningHours("wg harmonogramu")).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
  });
  it("status otwarcia", () => {
    const w = parseOpeningHours("Mo-Fr 06:00-22:00; Sa 08:00-20:00; Su off")!;
    expect(openStatus(w, 0, 12 * 60)).toEqual({ open: true, text: "Otwarte do 22:00" });
    expect(openStatus(w, 0, 5 * 60)).toEqual({ open: false, text: "Zamknięte, otwarcie o 6:00" });
    expect(openStatus(w, 5, 21 * 60)).toEqual({ open: false, text: "Zamknięte, otwarcie pn 6:00" });
    expect(openStatus(w, 4, 23 * 60)).toEqual({ open: false, text: "Zamknięte, otwarcie jutro 8:00" });
  });
  it("dzień tygodnia z daty", () => {
    expect(weekdayIndex("2026-10-13")).toBe(1); // wtorek
    expect(weekdayIndex("2026-10-18")).toBe(6); // niedziela
  });
});
