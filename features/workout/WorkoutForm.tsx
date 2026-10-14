"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { btnPrimary, chip, errorText, field, fieldNarrow, label, labelText } from "@/components/ui/styles";
import { newId, type WorkoutDraft } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import { addDays, type LocalDate } from "@/lib/domain/dates";
import { MOODS, STROKE_LABELS, STROKES, type Pool, type Stroke } from "@/lib/domain/model";
import { formatPace, parseDistance, parseDuration, validateWorkout } from "@/lib/domain/swim";
import { PoolPicker, recentPoolIds } from "./PoolPicker";

const DISTANCES = [1000, 1500, 2000, 2500, 3000];
const LENGTHS = [25, 50];
type SetDraft = { reps: string; distance: string; stroke: Stroke };

export function WorkoutForm({
  snapshot,
  today,
  presetPoolId,
  onSave,
}: {
  snapshot: Snapshot;
  today: LocalDate;
  presetPoolId?: number;
  /** Zapis w tle (kolejka offline) — formularz zamyka się od razu. */
  onSave: (draft: WorkoutDraft) => void;
}) {
  const recent = recentPoolIds(snapshot.workouts, snapshot.settings.defaultPoolId);
  const [date, setDate] = useState(today);
  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");
  const [poolId, setPoolId] = useState<number | null>(presetPoolId ?? recent[0] ?? null);
  const [length, setLength] = useState<number>(snapshot.settings.defaultLengthM);
  const [sets, setSets] = useState<SetDraft[]>([]);
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meters = parseDistance(distance);
  const seconds = parseDuration(time);
  const pace = meters && seconds ? formatPace(meters, seconds) : null;

  function pickPool(pool: Pool | null) {
    setPoolId(pool?.id ?? null);
    if (pool?.lengthM && LENGTHS.includes(pool.lengthM)) setLength(pool.lengthM);
  }

  function updateSet(i: number, patch: Partial<SetDraft>) {
    setSets((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (meters === null) return setError("Wpisz dystans w metrach, np. 1500.");
    if (seconds === null) return setError("Wpisz czas, np. 32:10 albo 45 (minuty).");
    const invalid = validateWorkout(meters, seconds);
    if (invalid) return setError(invalid);
    if (date < addDays(today, -14) || date > today) return setError("Data: od 14 dni temu do dziś. Starsze treningi wpadną ze Stravy.");
    if (sets.length > 40) return setError("Najwyżej 40 serii.");
    const parsedSets = [];
    for (const s of sets) {
      const reps = Number(s.reps);
      const dist = parseDistance(s.distance);
      if (!Number.isInteger(reps) || reps < 1 || reps > 50) return setError("Powtórzenia w serii: od 1 do 50.");
      if (dist === null || dist < 25 || dist > 2000) return setError("Odcinek w serii: od 25 do 2000 m.");
      parsedSets.push({ reps, distanceM: dist, stroke: s.stroke, restS: null });
    }
    setError(null);
    onSave({ id: newId(), userId: snapshot.userId, swumOn: date, distanceM: meters, durationS: seconds, poolId, poolLengthM: length, mood, note: note || null, sets: parsedSets });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          <span className={labelText}>Dystans (m)</span>
          <input inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="1500" className={field} />
        </label>
        <label className={label}>
          <span className={labelText}>Czas</span>
          <input inputMode="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="mm:ss" className={field} />
        </label>
      </div>
      <div className="-mt-2 flex flex-wrap gap-2" role="group" aria-label="Szybki dystans">
        {DISTANCES.map((d) => (
          <button key={d} type="button" onClick={() => setDistance(String(d))} className={`${chip(meters === d)} h-9 px-3`}>
            {d} m
          </button>
        ))}
      </div>
      <p className="-mt-3 h-5 text-sm text-muted" aria-live="polite">
        {pace ? `Tempo ${pace}` : ""}
      </p>

      <label className={label}>
        <span className={labelText}>Kiedy</span>
        <input type="date" value={date} min={addDays(today, -14)} max={today} onChange={(e) => setDate(e.target.value || today)} className={field} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelText} mb-2`}>Basen</legend>
        <PoolPicker value={poolId} onChange={pickPool} recent={recent} />
        <div className="mt-1 flex items-center gap-2" role="group" aria-label="Długość niecki">
          <span className="text-sm text-muted">Niecka</span>
          {LENGTHS.map((l) => (
            <button key={l} type="button" aria-pressed={length === l} onClick={() => setLength(l)} className={`${chip(length === l)} h-9 px-3`}>
              {l} m
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelText} mb-2`}>Serie (opcjonalnie)</legend>
        {sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_auto_4.5rem_minmax(0,1fr)_2.25rem] items-center gap-2">
            <input aria-label={`Seria ${i + 1}: powtórzenia`} inputMode="numeric" value={s.reps} onChange={(e) => updateSet(i, { reps: e.target.value })} className={fieldNarrow} />
            <span className="text-muted">×</span>
            <input aria-label={`Seria ${i + 1}: odcinek w metrach`} inputMode="numeric" value={s.distance} onChange={(e) => updateSet(i, { distance: e.target.value })} className={fieldNarrow} />
            <select aria-label={`Seria ${i + 1}: styl`} value={s.stroke} onChange={(e) => updateSet(i, { stroke: e.target.value as Stroke })} className={field}>
              {STROKES.map((st) => (
                <option key={st} value={st}>
                  {STROKE_LABELS[st]}
                </option>
              ))}
            </select>
            <button type="button" aria-label={`Usuń serię ${i + 1}`} onClick={() => setSets((prev) => prev.filter((_, k) => k !== i))} className="flex h-11 w-9 items-center justify-center text-muted">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSets((prev) => (prev.length >= 40 ? prev : [...prev, prev.at(-1) ? { ...prev.at(-1)! } : { reps: "4", distance: "100", stroke: "free" }]))}
          className="inline-flex h-11 items-center gap-1.5 self-start text-sm font-semibold text-accent"
        >
          <Plus aria-hidden="true" size={16} /> Dodaj serię
        </button>
        {sets.length > 0 && <p className="text-xs text-muted">Każde powtórzenie to +5 EXP (do 20).</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelText} mb-2`}>Samopoczucie</legend>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button key={m.value} type="button" aria-pressed={mood === m.value} onClick={() => setMood(mood === m.value ? null : m.value)} className={`${chip(mood === m.value)} h-10 px-3`}>
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className={label}>
        <span className={labelText}>Notatka</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="np. dużo ludzi, ból barku, nowe gogle"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted"
        />
      </label>

      {error && <p className={errorText}>{error}</p>}
      <button type="submit" className={btnPrimary}>
        Zapisz trening
      </button>
      <p className="-mt-3 text-center text-xs text-muted">Działa też bez internetu — nagrody policzę po wysłaniu.</p>
    </form>
  );
}
