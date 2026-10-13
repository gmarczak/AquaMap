import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount, percent } from "./money";

const nb = (s: string) => s.replace(/ /g, " ");

describe("parseAmount", () => {
  it("rozumie zapis polski i z kropką", () => {
    expect(parseAmount("38,50")).toBe(3850);
    expect(parseAmount("38.5")).toBe(3850);
    expect(parseAmount("38")).toBe(3800);
    expect(parseAmount("0,99")).toBe(99);
    expect(parseAmount(",5")).toBe(50);
  });

  it("separatory tysięcy: spacje, kropki, przecinki", () => {
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("6.200")).toBe(620000);
    expect(parseAmount("12 345 678")).toBe(1234567800);
  });

  it("znak i waluta", () => {
    expect(parseAmount("-14,99")).toBe(-1499);
    expect(parseAmount("−14,99 zł")).toBe(-1499);
    expect(parseAmount("+620 PLN")).toBe(62000);
  });

  it("odrzuca śmieci i więcej niż 2 miejsca po przecinku", () => {
    for (const bad of ["", "abc", "1,2,3", "1.2345", "12,34,56", "--5", "1e5"]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
});

describe("formatMoney", () => {
  it("grupuje tysiące i dokleja zł", () => {
    expect(formatMoney(218400)).toBe(nb("2 184 zł"));
    expect(formatMoney(2399)).toBe(nb("23,99 zł"));
    expect(formatMoney(4300, { cents: "always" })).toBe(nb("43,00 zł"));
    expect(formatMoney(123456789)).toBe(nb("1 234 567,89 zł"));
  });

  it("znaki: minus typograficzny, plus na życzenie", () => {
    expect(formatMoney(-3850)).toBe(nb("−38,50 zł"));
    expect(formatMoney(620000, { plusSign: true })).toBe(nb("+6 200 zł"));
    expect(formatMoney(0, { plusSign: true })).toBe(nb("0 zł"));
  });

  it("zaokrąglanie do złotych i inne waluty", () => {
    expect(formatMoney(218450, { cents: "never" })).toBe(nb("2 185 zł"));
    expect(formatMoney(12000, { currency: "EUR" })).toBe(nb("120 EUR"));
  });
});

describe("percent", () => {
  it("w dół, bez dzielenia przez zero", () => {
    expect(percent(38800, 40000)).toBe(97);
    expect(percent(39999, 40000)).toBe(99);
    expect(percent(100, 0)).toBe(0);
    expect(percent(50000, 40000)).toBe(125);
  });
});
