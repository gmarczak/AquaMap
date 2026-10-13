"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Globe, Navigation, Phone, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { btnPrimary, btnSecondary, chip, sectionTitle } from "@/components/ui/styles";
import { Stat, WorkoutRow } from "@/features/journal/JournalScreen";
import { useOpenNow } from "@/features/map/MapScreen";
import { useOpenWorkout } from "@/features/shell/AppShell";
import { poolPlace } from "@/features/workout/PoolPicker";
import { supabaseBrowser } from "@/lib/db/client";
import { useAction, usePools, useSnapshot, useToday } from "@/lib/data/hooks";
import { errorMessage, saveSettings, withSettings } from "@/lib/data/mutations";
import { DAY_SHORT_PL, hoursRows, parseOpeningHours, weekdayIndex } from "@/lib/domain/hours";
import { POOL_KIND_LABELS, type LaneSlot } from "@/lib/domain/model";
import { formatDistance } from "@/lib/domain/swim";

function safeUrl(url: string): string | null {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function useLaneSchedule(poolId: number) {
  return useQuery({
    queryKey: ["lanes", poolId],
    queryFn: async (): Promise<LaneSlot[]> => {
      const { data, error } = await supabaseBrowser().from("lane_schedules").select("weekday, starts, ends, lane, label").eq("pool_id", poolId).order("starts");
      if (error) throw error;
      return (data ?? []).map((r) => ({ weekday: r.weekday, starts: r.starts.slice(0, 5), ends: r.ends.slice(0, 5), lane: r.lane, label: r.label }));
    },
    staleTime: 1000 * 60 * 60,
  });
}

export function PoolScreen({ id }: { id: number }) {
  const { data: snapshot } = useSnapshot();
  const { data: pools, isPending } = usePools();
  const today = useToday(snapshot);
  const openWorkout = useOpenWorkout();
  const toast = useToast();
  const setHome = useAction(saveSettings, withSettings);
  const lanes = useLaneSchedule(id);
  const pool = pools?.find((p) => p.id === id);
  const status = useOpenNow(pool, snapshot?.settings.timezone ?? "Europe/Warsaw");
  const [day, setDay] = useState<number | null>(null);
  if (!snapshot || !today) return null;

  if (!pool) {
    return (
      <main className="flex flex-col gap-4 px-5 pt-10">
        <h1 className="font-serif text-2xl font-semibold">{isPending ? "Wczytuję…" : "Nie ma takiego basenu"}</h1>
        {!isPending && (
          <Link href="/map" className={`${btnSecondary} self-start`}>
            Wróć do mapy
          </Link>
        )}
      </main>
    );
  }

  const week = parseOpeningHours(pool.openingHours);
  const todayIdx = weekdayIndex(today);
  const mine = snapshot.workouts.filter((w) => w.poolId === pool.id);
  const isHome = snapshot.settings.defaultPoolId === pool.id;
  const web = pool.website ? safeUrl(pool.website) : null;
  const activeDay = day ?? todayIdx;
  const slots = (lanes.data ?? []).filter((s) => s.weekday === activeDay + 1);

  return (
    <main className="flex flex-col gap-7 px-5 pt-6 pb-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-start gap-1">
          <Link href="/map" aria-label="Wróć do mapy" className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center">
            <ChevronLeft aria-hidden="true" size={24} />
          </Link>
          <h1 className="pt-1 font-serif text-[26px] font-semibold leading-tight">{pool.name}</h1>
        </div>
        <p className="text-muted">{[POOL_KIND_LABELS[pool.kind], poolPlace(pool)].filter(Boolean).join(" · ")}</p>
        {status && <p className={`font-semibold ${status.open ? "text-accent" : "text-muted"}`}>{status.text}</p>}
      </header>

      <div className="flex gap-2">
        <button type="button" onClick={() => openWorkout({ poolId: pool.id })} className={`${btnPrimary} flex-1`}>
          Trening tutaj
        </button>
        <button
          type="button"
          aria-pressed={isHome}
          onClick={() =>
            setHome.mutate(
              { defaultPoolId: isHome ? null : pool.id },
              { onSuccess: () => toast({ message: isHome ? "To już nie Twój basen" : "Ustawione jako Twój basen" }), onError: (e) => toast({ message: errorMessage(e) }) },
            )
          }
          className={`${btnSecondary} gap-2 px-4`}
        >
          <Star aria-hidden="true" size={18} fill={isHome ? "currentColor" : "none"} className={isHome ? "text-accent" : ""} />
          {isHome ? "Mój basen" : "Mój"}
        </button>
      </div>

      <section aria-labelledby="hours" className="flex flex-col gap-2">
        <h2 id="hours" className={sectionTitle}>
          Godziny otwarcia
        </h2>
        {week ? (
          <dl className="flex flex-col">
            {hoursRows(week).map((r) => (
              <div key={r.days} className={`flex justify-between border-b border-border py-2 ${r.indices.includes(todayIdx) ? "font-semibold" : ""}`}>
                <dt>{r.days}</dt>
                <dd className="tabular-nums">{r.hours}</dd>
              </div>
            ))}
          </dl>
        ) : pool.openingHours ? (
          <p className="rounded-2xl bg-surface px-4 py-3">{pool.openingHours}</p>
        ) : (
          <p className="text-muted">Brak godzin w danych. Sprawdź na stronie basenu.</p>
        )}
      </section>

      {(lanes.data?.length ?? 0) > 0 && (
        <section aria-labelledby="lanes" className="flex flex-col gap-3">
          <h2 id="lanes" className={sectionTitle}>
            Zajętość torów
          </h2>
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Dzień">
            {DAY_SHORT_PL.map((d, i) => (
              <button key={d} type="button" role="tab" aria-selected={activeDay === i} onClick={() => setDay(i)} className={`${chip(activeDay === i)} h-9 shrink-0 px-3`}>
                {i === todayIdx ? "Dziś" : d}
              </button>
            ))}
          </div>
          {slots.length === 0 ? (
            <p className="text-muted">Tego dnia brak zajęć — tory wolne w godzinach otwarcia.</p>
          ) : (
            <ul className="flex flex-col">
              {slots.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-border py-2">
                  <span className="tabular-nums">
                    {s.starts}–{s.ends}
                  </span>
                  <span className="text-right text-muted">
                    {s.lane ? `tor ${s.lane}` : "tory"} · {s.label ?? "zajęte"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="info" className="flex flex-col gap-2">
        <h2 id="info" className={sectionTitle}>
          Informacje
        </h2>
        {(pool.lengthM || pool.lanes) && (
          <dl className="grid grid-cols-2 gap-2">
            {pool.lengthM && <Stat label="Niecka" value={`${pool.lengthM} m`} />}
            {pool.lanes && <Stat label="Tory" value={String(pool.lanes)} />}
          </dl>
        )}
        <div className="flex flex-col">
          {web && (
            <a href={web} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 border-b border-border">
              <Globe aria-hidden="true" size={18} className="text-accent" />
              <span className="truncate">{new URL(web).host.replace(/^www\./, "")}</span>
            </a>
          )}
          {pool.phone && (
            <a href={`tel:${pool.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-12 items-center gap-3 border-b border-border">
              <Phone aria-hidden="true" size={18} className="text-accent" />
              <span>{pool.phone}</span>
            </a>
          )}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${pool.lat},${pool.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center gap-3 border-b border-border"
          >
            <Navigation aria-hidden="true" size={18} className="text-accent" />
            <span>Prowadź do basenu</span>
          </a>
        </div>
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="mine" className="flex flex-col">
          <h2 id="mine" className={`${sectionTitle} mb-1`}>
            Twoje treningi tutaj · {mine.length} · {formatDistance(mine.reduce((s, w) => s + w.distanceM, 0))}
          </h2>
          <ul>
            {mine.slice(0, 5).map((w) => (
              <li key={w.id}>
                <WorkoutRow w={w} today={today} poolName={null} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        Dane basenu z OpenStreetMap
        {pool.osmId && (
          <>
            {" "}
            —{" "}
            <a href={`https://www.openstreetmap.org/${pool.osmId}`} target="_blank" rel="noopener noreferrer" className="underline">
              popraw albo uzupełnij
            </a>
          </>
        )}
        .
      </p>
    </main>
  );
}
