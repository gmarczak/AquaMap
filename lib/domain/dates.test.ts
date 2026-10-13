import { describe, expect, it } from "vitest";
import { addDays, diffDays, eachDay, isLocalDate, isoWeekday, localDate, startOfWeek } from "./dates";

const WAW = "Europe/Warsaw";

describe("localDate", () => {
  it("bierze datę w strefie użytkownika, nie w UTC", () => {
    // 23:30 UTC 10 października = 01:30 w Warszawie 11 października
    expect(localDate(new Date("2026-10-10T23:30:00Z"), WAW)).toBe("2026-10-11");
    // błąd starej wersji: toISOString dałby 2026-10-10
  });

  it("koniec dnia o 3:00 przesuwa noc na poprzedni dzień", () => {
    // 02:30 czasu warszawskiego 11.10 (UTC+2)
    const t = new Date("2026-10-11T00:30:00Z");
    expect(localDate(t, WAW, 0)).toBe("2026-10-11");
    expect(localDate(t, WAW, 3)).toBe("2026-10-10");
    // 03:00 to już nowy dzień
    expect(localDate(new Date("2026-10-11T01:00:00Z"), WAW, 3)).toBe("2026-10-11");
  });

  it("działa w dniach zmiany czasu (29.03 i 25.10.2026)", () => {
    // wiosna: 01:59 CET -> 03:00 CEST
    expect(localDate(new Date("2026-03-29T00:59:00Z"), WAW)).toBe("2026-03-29");
    expect(localDate(new Date("2026-03-29T22:30:00Z"), WAW)).toBe("2026-03-30");
    // jesień: 02:59 CEST -> 02:00 CET
    expect(localDate(new Date("2026-10-24T22:30:00Z"), WAW)).toBe("2026-10-25");
    expect(localDate(new Date("2026-10-25T22:59:00Z"), WAW)).toBe("2026-10-25");
    expect(localDate(new Date("2026-10-25T23:00:00Z"), WAW)).toBe("2026-10-26");
  });

  it("obsługuje strefy zachodnie", () => {
    expect(localDate(new Date("2026-10-11T03:00:00Z"), "America/New_York")).toBe("2026-10-10");
  });
});

describe("arytmetyka dat", () => {
  it("dodaje dni przez zmianę czasu i przełom miesięcy/lat", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("liczy różnicę dni", () => {
    expect(diffDays("2026-10-01", "2026-10-11")).toBe(10);
    expect(diffDays("2026-10-11", "2026-10-01")).toBe(-10);
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("dni tygodnia ISO i początek tygodnia", () => {
    expect(isoWeekday("2026-10-11")).toBe(7); // niedziela
    expect(isoWeekday("2026-10-12")).toBe(1); // poniedziałek
    expect(startOfWeek("2026-10-11", 1)).toBe("2026-10-05");
    expect(startOfWeek("2026-10-12", 1)).toBe("2026-10-12");
    expect(startOfWeek("2026-10-11", 7)).toBe("2026-10-11");
    expect(startOfWeek("2026-10-17", 7)).toBe("2026-10-11");
  });

  it("waliduje i wylicza zakresy", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-10-1")).toBe(false);
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDay("2026-10-02", "2026-10-01")).toEqual([]);
  });
});

describe("zegar ścienny", () => {
  it("minuty od północy w strefie", async () => {
    const { localMinutes } = await import("./dates");
    expect(localMinutes(new Date("2026-10-13T10:30:00Z"), "Europe/Warsaw")).toBe(12 * 60 + 30);
    expect(localMinutes(new Date("2026-12-01T23:15:00Z"), "Europe/Warsaw")).toBe(15);
  });
});
