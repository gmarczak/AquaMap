import { addDays, type LocalDate } from "@/lib/domain/dates";

const MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

function parts(date: LocalDate) {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

/** „12 paź”, z rokiem gdy inny niż bieżący. */
export function formatShortDate(date: LocalDate, today: LocalDate): string {
  const { y, m, d } = parts(date);
  const base = `${d} ${MONTHS_SHORT[m - 1]}`;
  return y === parts(today).y ? base : `${base} ${y}`;
}

/** „12 października 2026” */
export function formatLongDate(date: LocalDate): string {
  const { y, m, d } = parts(date);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}

/** Nagłówek dnia na liście transakcji: „Dziś, 12 paź”, „Wczoraj, 11 paź”, „10 paź”. */
export function formatDayHeading(date: LocalDate, today: LocalDate): string {
  const short = formatShortDate(date, today);
  if (date === today) return `Dziś, ${short}`;
  if (date === addDays(today, -1)) return `Wczoraj, ${short}`;
  return short;
}

/** Krótki opis daty w polach wyboru: „Dziś”, „Wczoraj”, „10 paź”. */
export function formatPickerDate(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Dziś";
  if (date === addDays(today, -1)) return "Wczoraj";
  return formatShortDate(date, today);
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}


/** Nagłówek tygodnia w dzienniku: „Ten tydzień”, „Poprzedni tydzień”, „29 wrz – 5 paź”. */
export function formatWeekHeading(weekStart: LocalDate, today: LocalDate): string {
  const thisWeek = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  if (weekStart === thisWeek) return "Ten tydzień";
  if (weekStart === addDays(thisWeek, -7)) return "Poprzedni tydzień";
  return `${formatShortDate(weekStart, today)} – ${formatShortDate(addDays(weekStart, 6), today)}`;
}
