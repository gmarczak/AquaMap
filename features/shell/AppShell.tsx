"use client";

import { useMutationState } from "@tanstack/react-query";
import { BookOpen, Map, Plus, Settings, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { RewardSheet, type RewardView } from "@/features/game/RewardSheet";
import { WorkoutForm } from "@/features/workout/WorkoutForm";
import { useSnapshot, useToday, useWorkoutMutation, WORKOUT_FAILED, workoutMutationKey } from "@/lib/data/hooks";
import { type WorkoutDraft } from "@/lib/data/mutations";
import { formatDistance } from "@/lib/domain/swim";

type OpenWorkout = (preset?: { poolId?: number }) => void;
type ShowReward = (reward: RewardView) => void;
const ShellContext = createContext<{ openWorkout: OpenWorkout; showReward: ShowReward }>({ openWorkout: () => {}, showReward: () => {} });
export const useOpenWorkout = () => useContext(ShellContext).openWorkout;
export const useShowReward = () => useContext(ShellContext).showReward;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: snapshot, isPending, error, refetch } = useSnapshot();
  const today = useToday(snapshot);
  const [adding, setAdding] = useState<{ poolId?: number } | null>(null);
  const [reward, setReward] = useState<RewardView | null>(null);
  const toast = useToast();
  const workoutMutation = useWorkoutMutation();
  const waiting = useMutationState({
    filters: { mutationKey: workoutMutationKey, status: "pending", predicate: (m) => m.state.isPaused || m.state.failureCount > 0 },
  }).length;

  const openWorkout: OpenWorkout = useCallback((preset) => setAdding(preset ?? {}), []);
  const showReward: ShowReward = useCallback((r) => setReward(r), []);

  // Odrzucony zapis z kolejki (także po przeładowaniu aplikacji) — komunikat z globalnej obsługi w providers.tsx
  useEffect(() => {
    const onFail = (e: Event) => {
      const d = (e as CustomEvent<{ date: string; distanceM: number; message: string }>).detail;
      toast({ message: `Nie zapisano treningu ${formatDistance(d.distanceM)} z ${d.date}: ${d.message}`, durationMs: 10000 });
    };
    window.addEventListener(WORKOUT_FAILED, onFail);
    return () => window.removeEventListener(WORKOUT_FAILED, onFail);
  }, [toast]);

  function saveWorkout(draft: WorkoutDraft) {
    setAdding(null);
    workoutMutation.mutate(draft, { onSuccess: (summary) => setReward({ kind: "workout", summary }) });
  }

  if (isPending && !snapshot) {
    return <div className="mx-auto min-h-dvh max-w-lg px-5 pt-10 text-muted">Wczytuję…</div>;
  }
  if (!snapshot || !today) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-start gap-4 px-5 pt-10">
        <h1 className="font-serif text-2xl font-semibold">Nie udało się wczytać danych</h1>
        <p className="text-muted">{error?.message ?? "Sprawdź połączenie z internetem."}</p>
        <button type="button" onClick={() => void refetch()} className="h-12 rounded-full bg-accent px-6 font-semibold text-accent-contrast">
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/workouts") : pathname.startsWith(href));
  const navLink = (href: string, label: string, Icon: typeof Map) => (
    <Link
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={`flex min-w-14 flex-col items-center gap-1 text-xs ${isActive(href) ? "font-bold text-text" : "font-medium text-muted"}`}
    >
      <Icon aria-hidden="true" size={22} strokeWidth={2} />
      {label}
    </Link>
  );
  const fullBleed = pathname === "/map";

  return (
    <ShellContext.Provider value={{ openWorkout, showReward }}>
      <div className={fullBleed ? "min-h-dvh" : "mx-auto min-h-dvh max-w-lg pb-[calc(5.5rem+env(safe-area-inset-bottom))]"}>
        {waiting > 0 && (
          <p role="status" className="mx-5 mt-4 rounded-xl bg-surface px-4 py-2.5 text-sm">
            {waiting === 1 ? "1 trening czeka" : `${waiting} treningi czekają`} na internet — wyślę automatycznie i wtedy policzę nagrody.
          </p>
        )}
        {children}
      </div>

      <nav aria-label="Główna nawigacja" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2">
          {navLink("/", "Dziennik", BookOpen)}
          {navLink("/map", "Baseny", Map)}
          <button
            type="button"
            aria-label="Dodaj trening"
            onClick={() => openWorkout()}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-contrast"
          >
            <Plus aria-hidden="true" size={26} strokeWidth={2.5} />
          </button>
          {navLink("/game", "Gra", Trophy)}
          {navLink("/settings", "Ustawienia", Settings)}
        </div>
      </nav>

      <Modal open={adding !== null} onClose={() => setAdding(null)} title="Nowy trening">
        {adding && <WorkoutForm snapshot={snapshot} today={today} presetPoolId={adding.poolId} onSave={saveWorkout} />}
      </Modal>
      <RewardSheet reward={reward} items={snapshot.items} onClose={() => setReward(null)} />
    </ShellContext.Provider>
  );
}
