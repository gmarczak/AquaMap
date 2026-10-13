"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { MutationCache, onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { snapshotKey, WORKOUT_FAILED, workoutMutationKey } from "@/lib/data/hooks";
import { errorMessage, isNetworkError, logWorkout, type WorkoutDraft } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";

const CACHE_VERSION = "aquamap-1";

function makeClient() {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, variables, _context, mutation) => {
        if (mutation.options.mutationKey?.[0] !== workoutMutationKey[0]) return;
        const draft = variables as WorkoutDraft;
        window.dispatchEvent(new CustomEvent(WORKOUT_FAILED, { detail: { date: draft.swumOn, distanceM: draft.distanceM, message: errorMessage(error) } }));
      },
    }),
    defaultOptions: {
      queries: { gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1, networkMode: "offlineFirst" },
      mutations: { networkMode: "online", retry: 3 },
    },
  });
  // Trening: przy słabym zasięgu (przeglądarka myśli, że jest online) ponawiaj do skutku, zamiast porzucać wpis.
  client.setMutationDefaults(workoutMutationKey, {
    mutationFn: (draft: WorkoutDraft) => logWorkout(supabaseBrowser(), draft),
    retry: (count, error) => isNetworkError(error) || count < 3,
    retryDelay: (attempt) => Math.min(30_000, 1000 * 2 ** attempt),
    onSettled: () => client.invalidateQueries({ queryKey: snapshotKey }),
  });
  return client;
}

/**
 * Po ponownym otwarciu aplikacji: wyślij treningi, które nie zdążyły się zapisać (zapis jest idempotentny).
 * Ruszamy tylko mutacje odtworzone z pamięci (id zebrane przed wznowieniem) i tylko szkice bieżącego konta.
 */
async function resumeWorkouts(client: QueryClient) {
  const cache = client.getMutationCache();
  const restored = new Set(cache.getAll().map((m) => m.mutationId));
  const { data } = await supabaseBrowser().auth.getSession();
  const userId = data.session?.user.id ?? null;
  for (const m of cache.getAll()) {
    const draft = m.state.variables as WorkoutDraft | undefined;
    if (m.options.mutationKey?.[0] === workoutMutationKey[0] && draft && draft.userId !== userId) cache.remove(m);
  }
  await client.resumePausedMutations();
  const stuck = cache
    .getAll()
    .filter((m) => restored.has(m.mutationId) && m.options.mutationKey?.[0] === workoutMutationKey[0] && m.state.status === "pending" && !m.state.isPaused);
  for (const m of stuck) {
    const draft = m.state.variables as WorkoutDraft;
    cache.remove(m);
    void cache.build(client, { mutationKey: workoutMutationKey }).execute(draft);
  }
  await client.invalidateQueries({ queryKey: snapshotKey });
}

const persister =
  typeof window === "undefined"
    ? undefined
    : createAsyncStoragePersister({
        storage: {
          getItem: async (key) => (await get<string>(key)) ?? null,
          setItem: (key, value) => set(key, value),
          removeItem: (key) => del(key),
        },
        key: "aquamap-cache",
        throttleTime: 500,
      });

const noop = () => () => {};

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  // Serwer i pierwsze malowanie klienta renderują to samo (pusto) — bez błędu hydracji.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    onlineManager.setOnline(navigator.onLine);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  if (!mounted || !persister) return null;
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        buster: CACHE_VERSION,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        // Zachowujemy tylko treningi — inne zapisy wymagają sieci i nie mają czym się wznowić
        dehydrateOptions: {
          shouldDehydrateMutation: (m) => m.options.mutationKey?.[0] === workoutMutationKey[0] && m.state.status === "pending",
        },
      }}
      onSuccess={() => void resumeWorkouts(client)}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
