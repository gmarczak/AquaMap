"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { useToast } from "@/components/ui/Toast";
import { btnPrimary, btnSecondary, sectionTitle } from "@/components/ui/styles";
import { snapshotKey, useAction } from "@/lib/data/hooks";
import { disconnectStrava, errorMessage } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import { supabaseBrowser } from "@/lib/db/client";
import { formatLongDate } from "@/lib/format";

const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? "";

/** Adres zgody w Stravie; po niej Strava wraca na /strava z kodem. */
export function stravaAuthorizeUrl(origin: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: `${origin}/strava`,
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

/** Wywołanie Edge Function z tokenem zalogowanego użytkownika. */
export async function stravaCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseBrowser().functions.invoke("aquamap-strava", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error((detail as { error?: string } | null)?.error ?? error.message);
  }
  return data as T;
}

export function StravaSection({ snapshot }: { snapshot: Snapshot }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const disconnect = useAction(disconnectStrava);
  const admin = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data } = await supabaseBrowser().rpc("is_admin");
      return data === true;
    },
    staleTime: Infinity,
  });
  const strava = snapshot.integrations.find((i) => i.provider === "strava");

  async function run(body: Record<string, unknown>, done: (r: Record<string, unknown>) => string) {
    setBusy(true);
    try {
      const r = await stravaCall<Record<string, unknown>>(body);
      toast({ message: done(r), durationMs: 6000 });
      await qc.invalidateQueries({ queryKey: snapshotKey });
    } catch (e) {
      toast({ message: errorMessage(e), durationMs: 8000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className={sectionTitle}>Strava i Garmin</h2>
      {!CLIENT_ID ? (
        <p className="text-sm text-muted">Połączenie ze Stravą jeszcze nie jest skonfigurowane na serwerze.</p>
      ) : strava ? (
        <>
          <p className="text-sm">
            Połączono (konto Strava #{strava.athleteId})
            {strava.lastSyncAt ? `, ostatnia synchronizacja ${formatLongDate(strava.lastSyncAt.slice(0, 10))}` : ""}. Nowe pływania wpadają same; starsze
            pobierzesz przyciskiem.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run({ action: "sync" }, (r) =>
                  Number(r.imported) > 0 ? `Zaimportowano ${r.imported} treningów` : Number(r.skipped) > 0 ? "Nic nowego (pominięto wpisane ręcznie)" : "Nic nowego",
                )
              }
              className={btnPrimary}
            >
              {busy ? "Pobieram…" : "Pobierz z 60 dni"}
            </button>
            <ConfirmButton label="Odłącz" confirmLabel="Odłączyć Stravę?" disabled={disconnect.isPending} onConfirm={() => disconnect.mutate(undefined, { onError: (e) => toast({ message: errorMessage(e) }) })} />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">Połącz Stravę, a każde pływanie z zegarka trafi do dziennika z EXP i nagrodami.</p>
          <a href={stravaAuthorizeUrl(typeof window === "undefined" ? "" : window.location.origin)} className={`${btnPrimary} self-start`}>
            Połącz ze Stravą
          </a>
        </>
      )}
      <p className="text-xs text-muted">
        Garmin: w aplikacji Garmin Connect połącz Stravę jako aplikację partnerską — treningi z zegarka przejdą przez Stravę do AquaMap. Ten sam trening wpisany
        wcześniej ręcznie (ten dzień, podobny dystans) nie zostanie zdublowany.
      </p>
      {admin.data && CLIENT_ID && (
        <button type="button" disabled={busy} onClick={() => void run({ action: "subscribe" }, (r) => (r.ok ? "Webhook Stravy włączony" : `Strava: ${JSON.stringify(r.data)}`))} className={`${btnSecondary} self-start`}>
          Admin: włącz webhook Stravy
        </button>
      )}
    </section>
  );
}
