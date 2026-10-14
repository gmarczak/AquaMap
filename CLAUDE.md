# CLAUDE.md — AquaMap

## Styl odpowiedzi (WAŻNE)
- Odpowiadaj **krótko, konkretnie i na temat**. Bez lania wody i zbędnych wstępów.
- Domyślnie po polsku.
- Bez zbędnego formatowania; listy tylko gdy realnie pomagają.
- Najpierw wynik / odpowiedź, potem ewentualnie 1–2 zdania kontekstu.
- Nie tłumacz oczywistości i nie streszczaj tego, co użytkownik już wie.

## Co to jest
AquaMap (rebuild, październik 2026) — PWA: mapa basenów w Polsce (OSM) + dziennik pływania + gra
(EXP, poziomy, passa, loot, sklep, questy, wyprawy, odznaki; dawny AquaQuest). Strava, Garmin przez Stravę.

## Stack
Next.js 16 App Router + TypeScript + Tailwind v4 + TanStack Query (IndexedDB, kolejka offline),
Supabase: projekt `fswfdsooabadlcpekiyx` (wspólny z Nawykami/Finansami/Garażem), schemat `swim`, RLS na
każdej tabeli. MapLibre + OpenFreeMap. Vercel projekt `aqua-map`.

## Skróty
- `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`

## Zasady
- EXP, monety, przedmioty: TYLKO funkcje SQL (`swim.log_workout`, `award_workout`, `buy_item`, `sell_item`,
  `claim_quest`). Klient ma tylko odczyt tych tabel. Logika gry w TS (`lib/domain/game.ts`) musi zgadzać się z SQL.
- Stan gracza = suma księgi `swim.rewards`; usunięcie treningu kaskadowo zdejmuje jego nagrody.
- Każda zmiana schematu: migracja w `supabase/migrations` + testy w `supabase/tests/behavior.sql`
  (CI liczy linie `t` i błędy — zaktualizuj liczby w `.github/workflows/ci.yml`).
- Sekrety Stravy tylko w Edge Functions. Daty jako lokalne `YYYY-MM-DD` (`lib/domain/dates.ts`).
- `app/preview/` — lokalny podgląd do zrzutów, wykluczony z gita.

## Stare wersje
- Dawny AquaMap (Vite, Mapbox, projekt Supabase `yxjnjrborhatabnmjlqe`) — historia gałęzi `main` sprzed rebuildu.
- AquaQuest (.NET + Railway) — repo `gmarczak/AquaQuest`, archiwum.
