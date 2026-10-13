"use client";

import { ChevronRight, CloudOff, Coins, Flame, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { sectionTitle } from "@/components/ui/styles";
import { useOpenWorkout } from "@/features/shell/AppShell";
import { usePools, useSnapshot, useToday } from "@/lib/data/hooks";
import { startOfWeek } from "@/lib/domain/dates";
import { levelInfo, streak, totals, weekStats } from "@/lib/domain/game";
import type { Workout } from "@/lib/domain/model";
import { formatDistance, formatDuration, formatPace } from "@/lib/domain/swim";
import { formatShortDate, formatWeekHeading, plural } from "@/lib/format";

export function LevelCard({ xp, coins, streakWeeks, streakAlive }: { xp: number; coins: number; streakWeeks: number; streakAlive: boolean }) {
  const lvl = levelInfo(xp);
  return (
    <Link href="/game" className="flex flex-col gap-3 rounded-[24px] bg-surface px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-accent leading-none text-accent-contrast">
          <span className="text-[10px] font-bold uppercase tracking-wider">poz.</span>
          <span className="font-serif text-xl font-semibold">{lvl.level}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{lvl.need ? `${lvl.into} / ${lvl.need} EXP` : "Maksymalny poziom"}</span>
            <span className="text-muted">do poz. {Math.min(lvl.level + 1, 50)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-label="Postęp poziomu" aria-valuenow={Math.round(lvl.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, lvl.pct * 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Coins aria-hidden="true" size={16} style={{ color: "var(--c-amber-fg)" }} /> {coins} monet
        </span>
        <span className={`flex items-center gap-1.5 font-semibold ${streakWeeks > 0 ? "" : "text-muted"}`}>
          <Flame aria-hidden="true" size={16} style={{ color: streakWeeks > 0 ? "var(--c-rose-fg)" : undefined }} />
          {streakWeeks > 0 ? `${streakWeeks} ${plural(streakWeeks, "tydzień", "tygodnie", "tygodni")} z rzędu` : "Bez passy"}
          {streakWeeks > 0 && !streakAlive && <span className="font-normal text-muted"> · popłyń w tym tygodniu</span>}
        </span>
      </div>
    </Link>
  );
}

export function WorkoutRow({ w, today, poolName }: { w: Workout; today: string; poolName: string | null }) {
  return (
    <Link href={`/workouts/${w.id}`} className="flex items-center gap-3 border-b border-border py-3.5">
      <span className="w-14 shrink-0 text-sm text-muted">{formatShortDate(w.swumOn, today)}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold tabular-nums">
          {formatDistance(w.distanceM)} · {formatDuration(w.durationS)}
        </span>
        <span className="truncate text-sm text-muted">
          {formatPace(w.distanceM, w.durationS)}
          {poolName ? ` · ${poolName}` : ""}
          {w.source === "strava" ? " · Strava" : ""}
        </span>
      </span>
      {w.pending && <CloudOff aria-label="Czeka na wysłanie" size={18} className="text-muted" />}
      <ChevronRight aria-hidden="true" size={18} className="text-muted" />
    </Link>
  );
}

export function JournalScreen() {
  const { data: snapshot } = useSnapshot();
  const { data: pools } = usePools();
  const today = useToday(snapshot);
  const openWorkout = useOpenWorkout();
  if (!snapshot || !today) return null;

  const t = totals(snapshot.rewards);
  const s = streak(snapshot.workouts, today);
  const week = weekStats(snapshot.workouts, today);
  const poolName = new Map((pools ?? []).map((p) => [p.id, p.name]));
  const claimable = snapshot.quests.filter((q) => !q.claimed && q.progress >= q.target).length;

  const groups: { week: string; items: Workout[] }[] = [];
  for (const w of snapshot.workouts) {
    const wk = startOfWeek(w.swumOn);
    const last = groups.at(-1);
    if (last && last.week === wk) last.items.push(w);
    else groups.push({ week: wk, items: [w] });
  }

  return (
    <main className="flex flex-col gap-7 px-5 pt-6">
      <h1 className="font-serif text-[32px] font-semibold">Dziennik</h1>
      <LevelCard xp={t.xp} coins={t.coins} streakWeeks={s.weeks} streakAlive={s.thisWeekDone} />

      <section aria-labelledby="week" className="flex flex-col gap-3">
        <h2 id="week" className={sectionTitle}>
          Ten tydzień
        </h2>
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Dystans" value={formatDistance(week.distanceM)} />
          <Stat label="Treningi" value={String(week.sessions)} />
          <Stat label="Czas" value={formatDuration(week.durationS)} />
        </dl>
        {claimable > 0 && (
          <Link href="/game" className="flex items-center gap-3 rounded-2xl border-[1.5px] border-accent px-4 py-3">
            <Trophy aria-hidden="true" size={20} className="text-accent" />
            <span className="flex-1 font-semibold">
              {claimable === 1 ? "Quest ukończony — odbierz nagrodę" : `${claimable} questy ukończone — odbierz nagrody`}
            </span>
            <ChevronRight aria-hidden="true" size={18} className="text-muted" />
          </Link>
        )}
      </section>

      {snapshot.workouts.length === 0 ? (
        <section className="flex flex-col items-start gap-3 pb-6">
          <p className="text-lg">Zapisz pierwszy trening — za każdy dostaniesz EXP, monety, a czasem przedmiot.</p>
          <button type="button" onClick={() => openWorkout()} className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-accent-contrast">
            <Plus aria-hidden="true" size={20} /> Dodaj trening
          </button>
          <p className="text-sm text-muted">Pływasz z zegarkiem? Połącz Stravę w Ustawieniach, a treningi wpadną same.</p>
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.week} aria-label={formatWeekHeading(g.week, today)} className="flex flex-col">
            <h2 className="flex items-baseline justify-between text-sm font-bold uppercase tracking-wider text-muted">
              <span>{formatWeekHeading(g.week, today)}</span>
              <span className="font-semibold normal-case tracking-normal">{formatDistance(g.items.reduce((sum, w) => sum + w.distanceM, 0))}</span>
            </h2>
            <ul>
              {g.items.map((w) => (
                <li key={w.id}>
                  <WorkoutRow w={w} today={today} poolName={w.poolId !== null ? (poolName.get(w.poolId) ?? null) : null} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <div className="pb-4" />
    </main>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-surface px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-[17px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
