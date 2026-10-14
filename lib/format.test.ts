import { describe, expect, it } from "vitest";
import { formatDayHeading, formatLongDate, formatPickerDate, formatShortDate, plural } from "./format";

describe("daty po polsku", () => {
  it("nagłówki dni", () => {
    expect(formatDayHeading("2026-10-12", "2026-10-12")).toBe("Dziś, 12 paź");
    expect(formatDayHeading("2026-10-11", "2026-10-12")).toBe("Wczoraj, 11 paź");
    expect(formatDayHeading("2026-10-01", "2026-10-12")).toBe("1 paź");
    expect(formatShortDate("2025-12-31", "2026-01-02")).toBe("31 gru 2025");
  });
  it("pole daty i pełna data", () => {
    expect(formatPickerDate("2026-10-12", "2026-10-12")).toBe("Dziś");
    expect(formatPickerDate("2026-10-11", "2026-10-12")).toBe("Wczoraj");
    expect(formatLongDate("2026-03-01")).toBe("1 marca 2026");
  });
  it("odmiana", () => {
    const t = (n: number) => plural(n, "dzień", "dni", "dni");
    expect([1, 2, 5].map(t)).toEqual(["dzień", "dni", "dni"]);
    const tr = (n: number) => plural(n, "transakcja", "transakcje", "transakcji");
    expect([1, 3, 5, 12, 22, 25].map(tr)).toEqual(["transakcja", "transakcje", "transakcji", "transakcji", "transakcje", "transakcji"]);
  });
});

describe("tygodnie w dzienniku", () => {
  it("ten, poprzedni i zakres dat", async () => {
    const { formatWeekHeading } = await import("./format");
    expect(formatWeekHeading("2026-10-12", "2026-10-13")).toBe("Ten tydzień");
    expect(formatWeekHeading("2026-10-05", "2026-10-18")).toBe("Poprzedni tydzień");
    expect(formatWeekHeading("2026-09-28", "2026-10-13")).toBe("28 wrz – 4 paź");
  });
});
