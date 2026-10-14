import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatPace, parseDistance, parseDuration, validateWorkout } from "./swim";

describe("czas", () => {
  it("odczytuje mm:ss, h:mm:ss i same minuty", () => {
    expect(parseDuration("32:10")).toBe(1930);
    expect(parseDuration("1:02:30")).toBe(3750);
    expect(parseDuration("45")).toBe(2700);
    expect(parseDuration("32.10")).toBe(1930);
    expect(parseDuration("90:00")).toBe(5400);
  });
  it("odrzuca błędne", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("12:75")).toBeNull();
    expect(parseDuration("1:75:00")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("0")).toBeNull();
  });
  it("formatuje", () => {
    expect(formatDuration(1930)).toBe("32:10");
    expect(formatDuration(3750)).toBe("1:02:30");
    expect(formatDuration(59)).toBe("0:59");
  });
});

describe("dystans i tempo", () => {
  it("tempo na 100 m", () => {
    expect(formatPace(1500, 1680)).toBe("1:52 /100 m");
    expect(formatPace(1000, 1200)).toBe("2:00 /100 m");
  });
  it("dystans", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(1500)).toBe("1\u00a0500 m");
    expect(formatDistance(12400)).toBe("12,4 km");
    expect(parseDistance("1 500")).toBe(1500);
    expect(parseDistance("1,5 km")).toBe(1500);
    expect(parseDistance("2km")).toBe(2000);
    expect(parseDistance("abc")).toBeNull();
  });
  it("limity jak w bazie", () => {
    expect(validateWorkout(1500, 1800)).toBeNull();
    expect(validateWorkout(1000, 500)).toMatch(/Tempo/);
    expect(validateWorkout(12000, 14000)).toMatch(/10 km/);
    expect(validateWorkout(10, 600)).toMatch(/25 m/);
  });
});
