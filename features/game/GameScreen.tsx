"use client";

import { Award, Backpack, Check, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { sectionTitle } from "@/components/ui/styles";
import { LevelCard } from "@/features/journal/JournalScreen";
import { useShowReward } from "@/features/shell/AppShell";
import { useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { claimQuest, errorMessage } from "@/lib/data/mutations";
import { badges, equipmentBonus, routeProgress, streak, totals } from "@/lib/domain/game";
import type { Quest } from "@/lib/domain/model";
import { formatDistance } from "@/lib/domain/swim";

function questProgressText(q: Quest): string {
  if (q.kind === "sessions") return `${Math.min(q.progress, q.target)} / ${q.target}`;
  if (q.kind === "sets") return `${Math.min(q.progress, q.target)} / ${q.target} serii`;
  return `${formatDistance(Math.min(q.progress, q.target))} / ${formatDistance(q.target)}`;
}

export function GameScreen() {
  const { data: snapshot } = useSnapshot();
  const today = useToday(snapshot);
  const showReward = useShowReward();
  const toast = useToast();
  const claim = useAction(claimQuest);
  if (!snapshot || !today) return null;

  const t = totals(snapshot.rewards);
  const s = streak(snapshot.workouts, today);
  const eq = equipmentBonus(snapshot.inventory, snapshot.items);
  const totalM = snapshot.workouts.filter((w) => !w.pending).reduce((sum, w) => sum + w.distanceM, 0);
  const routes = routeProgress(totalM);
  const active = routes.find((r) => r.active);
  const allBadges = badges(totalM);

  return (
    <main className="flex flex-col gap-8 px-5 pt-6 pb-8">
      <h1 className="font-serif text-[32px] font-semibold">Gra</h1>
      <LevelCard xp={t.xp} coins={t.coins} streakWeeks={s.weeks} streakAlive={s.thisWeekDone} />

      <section aria-labelledby="bonuses" className="flex flex-col gap-2">
        <h2 id="bonuses" className={sectionTitle}>
          Bonusy do następnego treningu
        </h2>
        <p className="text-muted">
          Passa <strong className="text-text">+{s.bonusPct}% EXP</strong> · ekwipunek <strong className="text-text">+{eq.xp}% EXP</strong> i{" "}
          <strong className="text-text">+{eq.coins}% monet</strong>
        </p>
        <Link href="/game/items" className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
          <Backpack aria-hidden="true" size={20} className="text-accent" />
          <span className="flex-1 font-semibold">Ekwipunek i sklep</span>
          <span className="text-sm text-muted">{snapshot.inventory.length} przedm.</span>
          <ChevronRight aria-hidden="true" size={18} className="text-muted" />
        </Link>
      </section>

      <section aria-labelledby="quests" className="flex flex-col gap-3">
        <h2 id="quests" className={sectionTitle}>
          Questy tygodnia
        </h2>
        {snapshot.quests.map((q) => {
          const old = snapshot.quests[0] !== undefined && q.week < snapshot.quests[0].week;
          const done = q.progress >= q.target;
          return (
            <div key={`${q.week}-${q.id}`} className="flex flex-col gap-2 rounded-2xl border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">
                  {old && <span className="block text-xs font-bold uppercase tracking-wider text-muted">Z zeszłego tygodnia</span>}
                  {q.title}
                </span>
                <span className="shrink-0 text-sm text-muted">
                  +{q.rewardXp} EXP · +{q.rewardCoins} monet
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{questProgressText(q)}</span>
                {q.claimed ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                    <Check aria-hidden="true" size={16} /> Odebrane
                  </span>
                ) : done ? (
                  <button
                    type="button"
                    disabled={claim.isPending}
                    onClick={() =>
                      claim.mutate(q, {
                        onSuccess: (result) => showReward({ kind: "quest", title: "Quest ukończony", result }),
                        onError: (e) => toast({ message: errorMessage(e) }),
                      })
                    }
                    className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-contrast"
                  >
                    Odbierz
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted">Nowe questy co poniedziałek. Nagrodę z zeszłego tygodnia można odebrać jeszcze przez tydzień.</p>
      </section>

      <section aria-labelledby="routes" className="flex flex-col gap-3">
        <h2 id="routes" className={sectionTitle}>
          Wyprawy
        </h2>
        {active ? (
          <div className="flex flex-col gap-3 rounded-[24px] bg-surface px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">W drodze</p>
              <p className="font-serif text-xl font-semibold">{active.name}</p>
              <p className="text-sm text-muted">{active.description}</p>
            </div>
            <RouteLine done={active.doneM} total={active.distanceM} />
            <p className="text-sm">
              <strong>{formatDistance(active.doneM)}</strong> z {formatDistance(active.distanceM)} · zostało {formatDistance(active.distanceM - active.doneM)}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-surface px-4 py-3">Wszystkie wyprawy ukończone — kolejne wkrótce.</p>
        )}
        <ol className="flex flex-col">
          {routes.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-border py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${r.completed ? "bg-accent text-accent-contrast" : "bg-surface text-muted"}`}>
                {r.completed ? <Check aria-hidden="true" size={16} /> : r.active ? <span className="h-2 w-2 rounded-full bg-accent" /> : <Lock aria-hidden="true" size={14} />}
              </span>
              <span className="flex-1">{r.name}</span>
              <span className="text-sm text-muted tabular-nums">{formatDistance(r.distanceM)}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">Dystans z każdego treningu płynie po kolei przez trasy.</p>
      </section>

      <section aria-labelledby="badges" className="flex flex-col gap-3">
        <h2 id="badges" className={sectionTitle}>
          Odznaki · {allBadges.filter((b) => b.earned).length}/{allBadges.length}
        </h2>
        <ul className="grid grid-cols-3 gap-2">
          {allBadges.map((b) => (
            <li key={b.id} className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center ${b.earned ? "bg-surface" : "border border-dashed border-border"}`}>
              <Award aria-hidden="true" size={26} className={b.earned ? "text-accent" : "text-muted opacity-50"} />
              <span className={`text-[13px] font-semibold leading-tight ${b.earned ? "" : "text-muted"}`}>{b.name}</span>
              <span className="text-[11px] leading-tight text-muted">{b.requirement}</span>
              <span className="sr-only">{b.earned ? "zdobyta" : "jeszcze nie"}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/** Trasa wyprawy jako fala: przepłynięta część w kolorze, kropka w miejscu, gdzie jesteś. */
function RouteLine({ done, total }: { done: number; total: number }) {
  const pct = Math.min(1, done / total);
  const w = 300;
  const path = Array.from({ length: 31 }, (_, i) => {
    const x = (i / 30) * w;
    const y = 20 + Math.sin(i / 2.2) * 8;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const cx = pct * w;
  const cy = 20 + Math.sin((pct * 30) / 2.2) * 8;
  return (
    <svg viewBox={`-8 0 ${w + 16} 40`} className="h-10 w-full" role="img" aria-label={`Postęp wyprawy: ${Math.round(pct * 100)}%`}>
      <defs>
        <clipPath id="route-done">
          <rect x="-8" y="0" width={cx + 8} height="40" />
        </clipPath>
      </defs>
      <path d={path} fill="none" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" clipPath="url(#route-done)" />
      <circle cx={cx} cy={cy} r="7" fill="var(--bg)" stroke="var(--accent)" strokeWidth="3" />
    </svg>
  );
}
