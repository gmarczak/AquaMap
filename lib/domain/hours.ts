/**
 * Godziny otwarcia w formacie OpenStreetMap — najczęstszy podzbiór:
 * „Mo-Fr 06:00-22:00; Sa,Su 08:00-20:00”, „24/7”, „Mo-Su 06:00-08:00,15:00-22:00”, „Su off”.
 * Reguły ze świętami, miesiącami czy tygodniami są pomijane (pokazujemy wtedy surowy tekst).
 */

export type Interval = { from: number; to: number }; // minuty od północy
export type WeekHours = Interval[][]; // indeks 0 = poniedziałek … 6 = niedziela

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export const DAY_SHORT_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const range = part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!range) return null;
    const a = DAYS.indexOf(range[1]!);
    const b = range[2] ? DAYS.indexOf(range[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): Interval[] | null {
  const out: Interval[] = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const from = toMinutes(m[1]!);
    const to = toMinutes(m[2]!);
    if (from === null || to === null || to <= from) return null;
    out.push({ from, to });
  }
  return out;
}

/** Null, gdy tekstu nie da się w całości zrozumieć. */
export function parseOpeningHours(text: string | null): WeekHours | null {
  if (!text) return null;
  const src = text.trim();
  if (src === "24/7") return Array.from({ length: 7 }, () => [{ from: 0, to: 1440 }]);
  const week: WeekHours = Array.from({ length: 7 }, () => []);
  let understood = false;
  for (const raw of src.split(";")) {
    const rule = raw.trim();
    if (!rule) continue;
    if (/^PH\b|^SH\b/.test(rule)) continue; // święta: pomijamy
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?(?:,PH)?\s*(.*)$/);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;
    const rest = m[2]!.trim();
    let times: Interval[];
    if (/^(off|closed)$/i.test(rest)) times = [];
    else {
      const parsed = parseTimes(rest);
      if (!parsed) return null;
      times = parsed;
    }
    for (const d of days) week[d] = times;
    understood = true;
  }
  return understood ? week : null;
}

/** Dzień tygodnia 0 = poniedziałek z daty lokalnej YYYY-MM-DD. */
export function weekdayIndex(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = niedziela
  return (d + 6) % 7;
}

export function isOpenAt(week: WeekHours, dayIndex: number, minutes: number): boolean {
  return week[dayIndex]!.some((i) => minutes >= i.from && minutes < i.to);
}

function fmt(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function formatIntervals(intervals: Interval[]): string {
  if (intervals.length === 0) return "zamknięte";
  if (intervals.length === 1 && intervals[0]!.from === 0 && intervals[0]!.to === 1440) return "całą dobę";
  return intervals.map((i) => `${fmt(i.from)}–${fmt(i.to)}`).join(", ");
}

/** Wiersze do wyświetlenia: kolejne dni z tymi samymi godzinami są łączone („Pn–Pt”). */
export function hoursRows(week: WeekHours): { days: string; hours: string; indices: number[] }[] {
  const rows: { days: string; hours: string; indices: number[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const hours = formatIntervals(week[i]!);
    const last = rows.at(-1);
    if (last && last.hours === hours && last.indices.at(-1) === i - 1) last.indices.push(i);
    else rows.push({ days: "", hours, indices: [i] });
  }
  for (const r of rows) {
    const a = DAY_SHORT_PL[r.indices[0]!]!;
    const b = DAY_SHORT_PL[r.indices.at(-1)!]!;
    r.days = r.indices.length === 1 ? a : `${a}–${b}`;
  }
  return rows;
}

/** „Otwarte do 22:00” / „Zamknięte, otwarcie jutro 6:00” / null gdy brak danych. */
export function openStatus(week: WeekHours, dayIndex: number, minutes: number): { open: boolean; text: string } {
  const today = week[dayIndex]!;
  const now = today.find((i) => minutes >= i.from && minutes < i.to);
  if (now) return { open: true, text: now.to === 1440 && now.from === 0 ? "Otwarte całą dobę" : `Otwarte do ${fmt(now.to)}` };
  const later = today.find((i) => i.from > minutes);
  if (later) return { open: false, text: `Zamknięte, otwarcie o ${fmt(later.from)}` };
  for (let k = 1; k <= 7; k++) {
    const day = week[(dayIndex + k) % 7]!;
    if (day.length > 0) {
      const when = k === 1 ? "jutro" : DAY_SHORT_PL[(dayIndex + k) % 7]!.toLowerCase();
      return { open: false, text: `Zamknięte, otwarcie ${when} ${fmt(day[0]!.from)}` };
    }
  }
  return { open: false, text: "Zamknięte" };
}
