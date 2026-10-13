/**
 * Daty kalendarzowe jako napisy "YYYY-MM-DD".
 * Jedyne miejsce w aplikacji, które zamienia chwilę (Date) na dzień użytkownika.
 * Arytmetyka na dniach jest czysto kalendarzowa (UTC wewnętrznie), więc zmiana czasu jej nie dotyczy.
 */

export type LocalDate = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isLocalDate(value: string): value is LocalDate {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function toUtcMs(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): LocalDate {
  const t = new Date(ms);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Dzień użytkownika w chwili `now`: zegar ścienny w jego strefie, cofnięty o `dayStartHour` godzin.
 * Ta sama reguła co `public.user_today()` w bazie.
 */
export function localDate(now: Date, timeZone: string, dayStartHour = 0): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const date = `${pad(get("year"), 4)}-${pad(get("month"))}-${pad(get("day"))}`;
  return get("hour") < dayStartHour ? addDays(date, -1) : date;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Liczba dni od `from` do `to` (dodatnia, gdy `to` jest później). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Dzień tygodnia ISO: 1 = poniedziałek … 7 = niedziela. */
export function isoWeekday(date: LocalDate): number {
  const d = new Date(toUtcMs(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

export type WeekStart = 1 | 7;

/** Pierwszy dzień tygodnia zawierającego `date` (tydzień od poniedziałku lub od niedzieli). */
export function startOfWeek(date: LocalDate, weekStart: WeekStart = 1): LocalDate {
  const wd = isoWeekday(date);
  const offset = weekStart === 1 ? wd - 1 : wd % 7;
  return addDays(date, -offset);
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b;
}

/** Wszystkie dni od `from` do `to` włącznie (pusta lista, gdy from > to). */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Dodanie miesięcy jak w Postgresie (`date + interval 'n months'`): 31.01 + 1 mies. = 28/29.02. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${pad(ny, 4)}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/** Minuty od północy na zegarze ściennym strefy (do „otwarte teraz”). */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}
