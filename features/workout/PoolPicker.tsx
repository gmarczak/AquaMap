"use client";

import { MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { fieldSearch } from "@/components/ui/styles";
import { usePools } from "@/lib/data/hooks";
import { normalize } from "@/lib/domain/geo";
import type { Pool, Workout } from "@/lib/domain/model";

export function poolPlace(p: Pick<Pool, "city" | "street">): string {
  return [p.street, p.city].filter(Boolean).join(", ");
}

/** Baseny, na których pływasz najczęściej (z historii), potem domyślny. */
export function recentPoolIds(workouts: readonly Workout[], defaultPoolId: number | null, limit = 4): number[] {
  const count = new Map<number, number>();
  for (const w of workouts) if (w.poolId !== null) count.set(w.poolId, (count.get(w.poolId) ?? 0) + 1);
  const ids = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (defaultPoolId !== null && !ids.includes(defaultPoolId)) ids.unshift(defaultPoolId);
  return ids.slice(0, limit);
}

/** Wybór basenu: ostatnie jednym dotknięciem, reszta przez wyszukiwanie po nazwie i mieście. */
export function PoolPicker({ value, onChange, recent }: { value: number | null; onChange: (pool: Pool | null) => void; recent: number[] }) {
  const { data: pools, isPending } = usePools();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const byId = useMemo(() => new Map((pools ?? []).map((p) => [p.id, p])), [pools]);
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2 || !pools) return [];
    return pools.filter((p) => normalize(`${p.name} ${p.city ?? ""} ${p.street ?? ""}`).includes(q)).slice(0, 30);
  }, [pools, query]);
  const selected = value !== null ? byId.get(value) : undefined;
  const quick = recent.map((id) => byId.get(id)).filter((p): p is Pool => Boolean(p));

  const option = (p: Pool, on: boolean) => (
    <button
      key={p.id}
      type="button"
      aria-pressed={on}
      onClick={() => {
        onChange(on ? null : p);
        setSearching(false);
        setQuery("");
      }}
      className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left ${on ? "border-accent" : "border-border"}`}
    >
      <MapPin aria-hidden="true" size={18} className={on ? "text-accent" : "text-muted"} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{p.name}</span>
        {poolPlace(p) && <span className="truncate text-sm text-muted">{poolPlace(p)}</span>}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {selected && !quick.some((p) => p.id === selected.id) && option(selected, true)}
      {quick.map((p) => option(p, p.id === value))}
      {searching ? (
        <>
          <label className="relative">
            <span className="sr-only">Szukaj basenu</span>
            <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nazwa albo miasto, np. Kolna" className={fieldSearch} />
          </label>
          {isPending && <p className="text-sm text-muted">Wczytuję baseny…</p>}
          {query.trim().length >= 2 && results.length === 0 && !isPending && <p className="text-sm text-muted">Nic nie znalazłem.</p>}
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">{results.map((p) => option(p, p.id === value))}</div>
        </>
      ) : (
        <button type="button" onClick={() => setSearching(true)} className="inline-flex h-11 items-center gap-2 self-start text-sm font-semibold text-accent">
          <Search aria-hidden="true" size={16} /> {quick.length || selected ? "Inny basen" : "Wybierz basen"}
        </button>
      )}
    </div>
  );
}
