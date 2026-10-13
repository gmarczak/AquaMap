"use client";

import { ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { useToast } from "@/components/ui/Toast";
import { btnPrimary, btnSecondary, chip, errorText, sectionTitle } from "@/components/ui/styles";
import { Stat } from "@/features/journal/JournalScreen";
import { usePools, useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { deleteWorkout, errorMessage, updateWorkout, withoutWorkout, withWorkoutMeta } from "@/lib/data/mutations";
import { MOODS, STROKE_LABELS } from "@/lib/domain/model";
import { formatDistance, formatDuration, formatPace } from "@/lib/domain/swim";
import { formatLongDate } from "@/lib/format";
import { poolPlace } from "./PoolPicker";

export function WorkoutScreen({ id }: { id: string }) {
  const { data: snapshot } = useSnapshot();
  const { data: pools } = usePools();
  const today = useToday(snapshot);
  const router = useRouter();
  const toast = useToast();
  const remove = useAction(deleteWorkout, withoutWorkout);
  const save = useAction(updateWorkout, withWorkoutMeta);
  const [editing, setEditing] = useState(false);
  const w = snapshot?.workouts.find((x) => x.id === id);
  const [mood, setMood] = useState<number | null>(w?.mood ?? null);
  const [note, setNote] = useState(w?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!snapshot || !today) return null;

  if (!w) {
    return (
      <main className="flex flex-col gap-4 px-5 pt-10">
        <h1 className="font-serif text-2xl font-semibold">Nie ma takiego treningu</h1>
        <Link href="/" className={`${btnSecondary} self-start`}>
          Wróć do dziennika
        </Link>
      </main>
    );
  }

  const pool = w.poolId !== null ? pools?.find((p) => p.id === w.poolId) : undefined;
  const xp = snapshot.rewards.filter((r) => r.workoutId === w.id).reduce((s, r) => s + r.xp, 0);
  const coins = snapshot.rewards.filter((r) => r.workoutId === w.id).reduce((s, r) => s + r.coins, 0);
  const record = snapshot.rewards.some((r) => r.workoutId === w.id && r.kind === "record");
  const loot = snapshot.inventory.filter((i) => i.workoutId === w.id);
  const itemName = new Map(snapshot.items.map((i) => [i.id, i.name]));

  return (
    <main className="flex flex-col gap-7 px-5 pt-6 pb-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <Link href="/" aria-label="Wróć do dziennika" className="-ml-3 flex h-11 w-11 items-center justify-center">
            <ChevronLeft aria-hidden="true" size={24} />
          </Link>
          <h1 className="font-serif text-[28px] font-semibold">{formatDistance(w.distanceM)}</h1>
        </div>
        <p className="text-muted">
          {formatLongDate(w.swumOn)}
          {w.source === "strava" ? " · ze Stravy" : ""}
          {w.pending ? " · czeka na wysłanie" : ""}
        </p>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Czas" value={formatDuration(w.durationS)} />
        <Stat label="Tempo" value={formatPace(w.distanceM, w.durationS).replace(" /100 m", "")} />
        <Stat label="Niecka" value={w.poolLengthM ? `${w.poolLengthM} m` : "—"} />
      </dl>

      {!w.pending && (
        <p className="rounded-2xl bg-surface px-4 py-3">
          {xp > 0 ? (
            <>
              <strong>+{xp} EXP</strong> i <strong>+{coins} monet</strong>
              {record ? " · rekord tempa" : ""}
              {loot.length > 0 ? ` · ${loot.map((l) => itemName.get(l.itemId)).join(", ")}` : ""}
            </>
          ) : (
            "Bez nagród (limit 2 treningów dziennie albo tempo poza zakresem)."
          )}
        </p>
      )}

      {pool && (
        <Link href={`/pools/${pool.id}`} className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
          <MapPin aria-hidden="true" size={20} className="text-accent" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{pool.name}</span>
            {poolPlace(pool) && <span className="truncate text-sm text-muted">{poolPlace(pool)}</span>}
          </span>
        </Link>
      )}

      {w.sets.length > 0 && (
        <section aria-labelledby="sets" className="flex flex-col gap-2">
          <h2 id="sets" className={sectionTitle}>
            Serie
          </h2>
          <ol className="flex flex-col">
            {w.sets.map((s, i) => (
              <li key={i} className="flex justify-between border-b border-border py-2.5">
                <span className="font-semibold tabular-nums">
                  {s.reps} × {s.distanceM} m
                </span>
                <span className="text-muted">{STROKE_LABELS[s.stroke]}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="notes" className="flex flex-col gap-3">
        <h2 id="notes" className={sectionTitle}>
          Samopoczucie i notatka
        </h2>
        {editing ? (
          <>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button key={m.value} type="button" aria-pressed={mood === m.value} onClick={() => setMood(mood === m.value ? null : m.value)} className={`${chip(mood === m.value)} h-10 px-3`}>
                  {m.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              aria-label="Notatka"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base"
            />
            {error && <p className={errorText}>{error}</p>}
            <button
              type="button"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({ id: w.id, mood, note, poolId: w.poolId }, { onSuccess: () => setEditing(false), onError: (e) => setError(errorMessage(e)) })
              }
              className={`${btnPrimary} self-start`}
            >
              Zapisz
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} disabled={w.pending} className="flex flex-col items-start gap-1 rounded-2xl bg-surface px-4 py-3 text-left">
            <span className="font-semibold">{w.mood ? MOODS.find((m) => m.value === w.mood)?.label : "Bez oceny"}</span>
            <span className="whitespace-pre-wrap text-muted">{w.note ?? "Dotknij, żeby dopisać notatkę."}</span>
          </button>
        )}
      </section>

      {!w.pending && (
        <section className="flex flex-col items-start gap-2">
          <ConfirmButton
            label="Usuń trening"
            confirmLabel="Usunąć? Zabiorę też jego nagrody"
            disabled={remove.isPending}
            onConfirm={() =>
              remove.mutate(w.id, {
                onSuccess: () => {
                  toast({ message: "Trening usunięty" });
                  router.replace("/");
                },
                onError: (e) => toast({ message: errorMessage(e) }),
              })
            }
          />
          <p className="text-xs text-muted">Usunięcie cofa EXP, monety i przedmioty zdobyte w tym treningu.</p>
        </section>
      )}
    </main>
  );
}
