// Czysta logika importu ze Stravy (bez Deno i sieci) — testowana w vitest.

export type StravaActivity = {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  start_date_local?: string;
  start_latlng?: number[] | null;
};

export type Existing = { swum_on: string; distance_m: number; source: string };
export type PoolPoint = { id: number; lat: number; lng: number };

export type ImportRow = { externalId: string; swumOn: string; distanceM: number; durationS: number; note: string | null; latlng: [number, number] | null };

const DEFAULT_NAMES = /^(morning|afternoon|evening|night|lunch)?\s*(pool\s*)?swim$|^(poranne|popołudniowe|wieczorne|nocne)?\s*pływanie$/i;

export function isSwim(a: StravaActivity): boolean {
  return a.type === "Swim" || a.sport_type === "Swim";
}

/** Aktywność Stravy → wiersz treningu; null gdy to nie pływanie albo brak danych. */
export function toImportRow(a: StravaActivity): ImportRow | null {
  if (!isSwim(a)) return null;
  const distanceM = Math.round(a.distance ?? 0);
  const durationS = Math.round(a.moving_time || a.elapsed_time || 0);
  const swumOn = (a.start_date_local ?? "").slice(0, 10);
  if (distanceM < 25 || durationS < 60 || !/^\d{4}-\d{2}-\d{2}$/.test(swumOn)) return null;
  const name = (a.name ?? "").trim();
  const latlng = a.start_latlng && a.start_latlng.length === 2 ? ([a.start_latlng[0], a.start_latlng[1]] as [number, number]) : null;
  return { externalId: String(a.id), swumOn, distanceM, durationS, note: name && !DEFAULT_NAMES.test(name) ? name.slice(0, 1000) : null, latlng };
}

/** Ten sam trening wpisany wcześniej ręcznie: ten sam dzień i dystans różniący się o najwyżej 10%. */
export function isManualDuplicate(row: ImportRow, existing: readonly Existing[]): boolean {
  return existing.some((e) => e.source === "manual" && e.swum_on === row.swumOn && Math.abs(e.distance_m - row.distanceM) <= row.distanceM * 0.1);
}

function km(a: [number, number], b: PoolPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a[0]);
  const dLng = rad(b.lng - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Najbliższy basen w promieniu 300 m od startu (pływanie na basenie zwykle nie ma GPS — wtedy null). */
export function matchPool(latlng: [number, number] | null, pools: readonly PoolPoint[]): number | null {
  if (!latlng) return null;
  let best: number | null = null;
  let bestKm = 0.3;
  for (const p of pools) {
    const d = km(latlng, p);
    if (d <= bestKm) {
      bestKm = d;
      best = p.id;
    }
  }
  return best;
}
