/** Czas i dystans pływania: wpisywanie i wyświetlanie. */

/** „32:10” → 1930 s, „1:02:30” → 3750 s, „45” → 45 min. Null gdy nie da się odczytać. */
export function parseDuration(input: string): number | null {
  const s = input.trim().replace(/\s+/g, "").replace(/[.,]/g, ":");
  if (/^\d{1,3}$/.test(s)) {
    const min = Number(s);
    return min > 0 ? min * 60 : null;
  }
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const [, h, mm, ss] = m;
  if (Number(ss) >= 60) return null;
  if (h !== undefined && Number(mm) >= 60) return null;
  const total = Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
  return total > 0 ? total : null;
}

/** 1930 → „32:10”, 3750 → „1:02:30”. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Tempo w sekundach na 100 m. */
export function pacePer100(distanceM: number, durationS: number): number {
  return distanceM > 0 ? (durationS / distanceM) * 100 : 0;
}

/** „1:52 /100 m” */
export function formatPace(distanceM: number, durationS: number): string {
  return `${formatDuration(pacePer100(distanceM, durationS))} /100 m`;
}

/** „850 m”, „1 500 m”, „12,4 km” (od 10 km w kilometrach). */
export function formatDistance(meters: number): string {
  if (meters >= 10000) return `${(meters / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} km`;
  return `${String(Math.round(meters)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")} m`;
}

/** Dystans z klawiatury: „1500”, „1 500”, „1,5 km”, „2km” → metry. */
export function parseDistance(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  const km = s.match(/^(\d{1,2}(?:[.,]\d{1,3})?)km$/);
  if (km) return Math.round(Number(km[1]!.replace(",", ".")) * 1000);
  const m = s.match(/^(\d{1,5})m?$/);
  return m ? Number(m[1]) : null;
}

/** Limity jak w bazie (swim.log_workout): tempo nie szybsze niż 1:00/100 m, max 10 km i 4 h. */
export function validateWorkout(distanceM: number, durationS: number): string | null {
  if (distanceM < 25) return "Dystans co najmniej 25 m.";
  if (distanceM > 10000) return "Najwyżej 10 km na jeden trening.";
  if (durationS < 60) return "Czas co najmniej minuta.";
  if (durationS > 4 * 3600) return "Najwyżej 4 godziny na jeden trening.";
  if (durationS < distanceM * 0.6) return "Tempo szybsze niż 1:00/100 m — sprawdź dystans i czas.";
  return null;
}
