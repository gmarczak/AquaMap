import { describe, expect, it } from "vitest";
import { isManualDuplicate, matchPool, toImportRow } from "./logic";

describe("import ze Stravy", () => {
  it("bierze tylko pływanie i liczy z czasu ruchu", () => {
    expect(toImportRow({ id: 1, type: "Run", distance: 5000, moving_time: 1500, start_date_local: "2026-10-12T07:00:00Z" })).toBeNull();
    expect(toImportRow({ id: 2, type: "Swim", name: "Morning Swim", distance: 1500.4, moving_time: 1800, elapsed_time: 2400, start_date_local: "2026-10-12T07:00:00Z" })).toEqual({
      externalId: "2", swumOn: "2026-10-12", distanceM: 1500, durationS: 1800, note: null, latlng: null,
    });
    expect(toImportRow({ id: 3, sport_type: "Swim", name: "Interwały 10×100", distance: 2000, moving_time: 2500, start_date_local: "2026-10-12T19:00:00Z" })?.note).toBe("Interwały 10×100");
    expect(toImportRow({ id: 4, type: "Swim", distance: 0, moving_time: 600, start_date_local: "2026-10-12T19:00:00Z" })).toBeNull();
  });
  it("nie dubluje treningu wpisanego ręcznie", () => {
    const row = toImportRow({ id: 5, type: "Swim", distance: 1550, moving_time: 1800, start_date_local: "2026-10-12T07:00:00Z" })!;
    expect(isManualDuplicate(row, [{ swum_on: "2026-10-12", distance_m: 1500, source: "manual" }])).toBe(true);
    expect(isManualDuplicate(row, [{ swum_on: "2026-10-12", distance_m: 1000, source: "manual" }])).toBe(false);
    expect(isManualDuplicate(row, [{ swum_on: "2026-10-11", distance_m: 1500, source: "manual" }])).toBe(false);
  });
  it("dopasowuje basen w promieniu 300 m", () => {
    const pools = [{ id: 7, lat: 50.05, lng: 19.95 }, { id: 8, lat: 50.2, lng: 19.95 }];
    expect(matchPool([50.051, 19.951], pools)).toBe(7);
    expect(matchPool([50.1, 19.95], pools)).toBeNull();
    expect(matchPool(null, pools)).toBeNull();
  });
});
