"use client";

import { ChevronRight, List, LocateFixed, Map as MapIcon, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useOpenWorkout } from "@/features/shell/AppShell";
import { poolPlace, recentPoolIds } from "@/features/workout/PoolPicker";
import { useNow, usePools, useSnapshot, useToday } from "@/lib/data/hooks";
import { localMinutes } from "@/lib/domain/dates";
import { distanceKm, formatKmAway, normalize } from "@/lib/domain/geo";
import { openStatus, parseOpeningHours, weekdayIndex } from "@/lib/domain/hours";
import { POOL_KIND_LABELS, type Pool } from "@/lib/domain/model";
import { plural } from "@/lib/format";

const PoolMap = dynamic(() => import("./PoolMap").then((m) => m.PoolMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted">Wczytuję mapę…</div>,
});

type Pos = { lat: number; lng: number };

/** „Otwarte do 22:00” dla basenu z godzinami w formacie OSM; null gdy brak danych. */
export function useOpenNow(pool: Pool | undefined, timezone: string) {
  const now = useNow();
  if (!pool) return null;
  const week = parseOpeningHours(pool.openingHours);
  if (!week) return null;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return openStatus(week, weekdayIndex(date), localMinutes(now, timezone));
}

export function MapScreen() {
  const { data: snapshot } = useSnapshot();
  const { data: pools, isPending, error } = usePools();
  const today = useToday(snapshot);
  const openWorkout = useOpenWorkout();
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<Pos | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const byId = useMemo(() => new Map((pools ?? []).map((p) => [p.id, p])), [pools]);
  const home = useMemo(() => {
    if (!snapshot) return null;
    const id = recentPoolIds(snapshot.workouts, snapshot.settings.defaultPoolId, 1)[0];
    const p = id !== undefined ? byId.get(id) : undefined;
    return p ? { lat: p.lat, lng: p.lng } : null;
  }, [snapshot, byId]);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = (pools ?? []).filter((p) => !q || normalize(`${p.name} ${p.city ?? ""} ${p.street ?? ""}`).includes(q));
    const ref = user ?? home;
    if (ref) return list.map((p) => ({ p, km: distanceKm(ref, p) })).sort((a, b) => a.km - b.km);
    return list.map((p) => ({ p, km: null as number | null })).sort((a, b) => a.p.name.localeCompare(b.p.name, "pl"));
  }, [pools, query, user, home]);
  const mapPools = useMemo(() => (query.trim() ? filtered.map((f) => f.p) : (pools ?? [])), [query, filtered, pools]);
  const pool = selected !== null ? byId.get(selected) : undefined;
  const status = useOpenNow(pool, snapshot?.settings.timezone ?? "Europe/Warsaw");

  function locate() {
    setLocError(null);
    if (!("geolocation" in navigator)) return setLocError("Ta przeglądarka nie udostępnia lokalizacji.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setUser({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocError("Brak zgody na lokalizację — włącz ją w ustawieniach przeglądarki."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  if (!snapshot || !today) return null;
  const kmTo = pool && (user ?? home) ? distanceKm((user ?? home)!, pool) : null;

  return (
    <main className="relative h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] overflow-hidden">
      <h1 className="sr-only">Baseny</h1>
      <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-lg flex-col gap-2 px-4 pt-4">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Szukaj basenu</span>
            <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj: nazwa, miasto, ulica"
              className="h-12 w-full rounded-full border border-border bg-bg pl-11 pr-10 text-base shadow-sm placeholder:text-muted"
            />
            {query && (
              <button type="button" aria-label="Wyczyść" onClick={() => setQuery("")} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted">
                <X aria-hidden="true" size={18} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setMode(mode === "map" ? "list" : "map")}
            aria-label={mode === "map" ? "Pokaż listę" : "Pokaż mapę"}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-bg shadow-sm"
          >
            {mode === "map" ? <List aria-hidden="true" size={20} /> : <MapIcon aria-hidden="true" size={20} />}
          </button>
          <button type="button" onClick={locate} aria-label="Pokaż baseny w pobliżu" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-bg shadow-sm">
            <LocateFixed aria-hidden="true" size={20} className={user ? "text-accent" : ""} />
          </button>
        </div>
        {locError && <p className="rounded-xl bg-bg px-4 py-2 text-sm text-danger shadow-sm">{locError}</p>}
        {error && <p className="rounded-xl bg-bg px-4 py-2 text-sm text-danger shadow-sm">Nie udało się wczytać basenów: {error.message}</p>}
      </div>

      {mode === "map" ? (
        <PoolMap pools={mapPools} selectedId={selected} onSelect={setSelected} center={home} user={user} />
      ) : (
        <div className="mx-auto h-full max-w-lg overflow-y-auto px-5 pb-6 pt-24">
          {isPending && <p className="text-muted">Wczytuję baseny…</p>}
          <p className="mb-2 text-sm text-muted">
            {filtered.length} {plural(filtered.length, "basen", "baseny", "basenów")}
            {user ? " · od najbliższego" : home ? " · od Twojego basenu" : ""}
          </p>
          <ul>
            {filtered.slice(0, 80).map(({ p, km }) => (
              <li key={p.id}>
                <Link href={`/pools/${p.id}`} className="flex items-center gap-3 border-b border-border py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="truncate text-sm text-muted">{poolPlace(p) || POOL_KIND_LABELS[p.kind]}</span>
                  </span>
                  {km !== null && <span className="shrink-0 text-sm text-muted tabular-nums">{formatKmAway(km)}</span>}
                  <ChevronRight aria-hidden="true" size={18} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {filtered.length > 80 && <p className="pt-3 text-sm text-muted">Pokazuję 80 — zawęź wyszukiwanie.</p>}
        </div>
      )}

      {mode === "map" && pool && (
        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-lg px-4 pb-4">
          <div className="flex flex-col gap-3 rounded-[24px] border border-border bg-bg px-5 py-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">{POOL_KIND_LABELS[pool.kind]}</span>
                <span className="font-serif text-xl font-semibold leading-tight">{pool.name}</span>
                <span className="text-sm text-muted">{[poolPlace(pool), kmTo !== null ? formatKmAway(kmTo) : null].filter(Boolean).join(" · ")}</span>
                {status && <span className={`text-sm font-semibold ${status.open ? "text-accent" : "text-muted"}`}>{status.text}</span>}
              </div>
              <button type="button" aria-label="Zamknij" onClick={() => setSelected(null)} className="-mr-2 -mt-1 flex h-10 w-10 items-center justify-center text-muted">
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="flex gap-2">
              <Link href={`/pools/${pool.id}`} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border-[1.5px] border-control font-semibold">
                Szczegóły
              </Link>
              <button type="button" onClick={() => openWorkout({ poolId: pool.id })} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-accent font-semibold text-accent-contrast">
                Trening tutaj
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
