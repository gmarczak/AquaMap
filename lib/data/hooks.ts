"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabaseBrowser, type Supabase } from "@/lib/db/client";
import { localDate, type LocalDate } from "@/lib/domain/dates";
import type { WorkoutSummary } from "@/lib/domain/model";
import { withWorkout, type WorkoutDraft } from "./mutations";
import { fetchPools, fetchSnapshot, type Snapshot } from "./snapshot";

export const snapshotKey = ["snapshot"] as const;
export const poolsKey = ["pools"] as const;
export const workoutMutationKey = ["workout-draft"] as const;
/** Zdarzenie: zapis treningu z kolejki ostatecznie odrzucony (komunikat także po przeładowaniu aplikacji). */
export const WORKOUT_FAILED = "aquamap:workout-failed";

export function useSnapshot() {
  return useQuery({
    queryKey: snapshotKey,
    queryFn: () => fetchSnapshot(supabaseBrowser()),
    staleTime: 60_000,
  });
}

/** Baseny (ok. 1000): wspólne dla wszystkich, zmieniają się rzadko — długi cache. */
export function usePools() {
  return useQuery({
    queryKey: poolsKey,
    queryFn: () => fetchPools(supabaseBrowser()),
    staleTime: 1000 * 60 * 60 * 24,
  });
}

/** Dzisiejsza data użytkownika; odświeża się co minutę i po powrocie do aplikacji. */
export function useToday(snapshot: Snapshot | undefined): LocalDate | null {
  const now = useNow();
  if (!snapshot) return null;
  return localDate(now, snapshot.settings.timezone);
}

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/**
 * Trening: pojawia się od razu, serwer liczy nagrody w tle.
 * Funkcja zapisu jest zarejestrowana w providers.tsx (setMutationDefaults), więc wpis
 * dodany bez sieci przetrwa zamknięcie aplikacji i wyśle się po powrocie internetu.
 */
export function useWorkoutMutation() {
  const qc = useQueryClient();
  return useMutation<WorkoutSummary, Error, WorkoutDraft, { previous: Snapshot | undefined }>({
    mutationKey: workoutMutationKey,
    onMutate: async (draft) => {
      await qc.cancelQueries({ queryKey: snapshotKey });
      const previous = qc.getQueryData<Snapshot>(snapshotKey);
      if (previous) qc.setQueryData<Snapshot>(snapshotKey, withWorkout(previous, draft));
      return { previous };
    },
    onError: (_error, _draft, context) => {
      if (context?.previous) qc.setQueryData(snapshotKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}

/** Pozostałe zapisy: wymagają sieci, po sukcesie odświeżają snapshot. Opcjonalna zmiana optymistyczna. */
export function useAction<TInput, TResult = void>(
  run: (supabase: Supabase, input: TInput) => Promise<TResult>,
  optimistic?: (snapshot: Snapshot, input: TInput) => Snapshot,
) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TInput, { previous: Snapshot | undefined }>({
    mutationFn: (input) => run(supabaseBrowser(), input),
    onMutate: async (input) => {
      const previous = qc.getQueryData<Snapshot>(snapshotKey);
      if (optimistic && previous) {
        await qc.cancelQueries({ queryKey: snapshotKey });
        qc.setQueryData<Snapshot>(snapshotKey, optimistic(previous, input));
      }
      return { previous };
    },
    onError: (_e, _i, context) => {
      if (optimistic && context?.previous) qc.setQueryData(snapshotKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}
