"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnPrimary } from "@/components/ui/styles";
import { snapshotKey } from "@/lib/data/hooks";
import { errorMessage } from "@/lib/data/mutations";
import { stravaCall } from "./StravaSection";

/** Powrót ze Stravy: wymiana kodu na tokeny, potem import ostatnich pływań. */
export function StravaCallback({ code, error, scope }: { code: string | null; error: string | null; scope: string | null }) {
  const qc = useQueryClient();
  const started = useRef(false);
  const [state, setState] = useState<{ phase: "working" | "done" | "error"; text: string }>(() =>
    error || !code
      ? { phase: "error", text: "Nie udzielono zgody w Stravie." }
      : scope && !scope.includes("activity:read")
        ? { phase: "error", text: "Zaznacz w Stravie zgodę na odczyt aktywności i spróbuj jeszcze raz." }
        : { phase: "working", text: "Łączę ze Stravą…" },
  );

  useEffect(() => {
    if (state.phase !== "working" || started.current || !code) return;
    started.current = true;
    void (async () => {
      try {
        await stravaCall({ action: "exchange", code });
        setState({ phase: "working", text: "Połączono. Pobieram pływania z 60 dni…" });
        const r = await stravaCall<{ imported: number; skipped: number }>({ action: "sync" });
        await qc.invalidateQueries({ queryKey: snapshotKey });
        setState({ phase: "done", text: r.imported > 0 ? `Gotowe — zaimportowano ${r.imported} treningów.` : "Gotowe — nowe pływania będą wpadać same." });
      } catch (e) {
        setState({ phase: "error", text: errorMessage(e) });
      }
    })();
  }, [code, qc, state.phase]);

  return (
    <main className="flex flex-col gap-5 px-5 pt-10">
      <h1 className="font-serif text-[28px] font-semibold">Strava</h1>
      <p className={state.phase === "error" ? "text-danger" : ""} aria-live="polite">
        {state.text}
      </p>
      {state.phase !== "working" && (
        <Link href={state.phase === "done" ? "/" : "/settings"} className={`${btnPrimary} self-start`}>
          {state.phase === "done" ? "Do dziennika" : "Wróć do ustawień"}
        </Link>
      )}
    </main>
  );
}
