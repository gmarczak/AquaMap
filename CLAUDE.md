# CLAUDE.md — AquaMap

## Styl odpowiedzi (WAŻNE)
- Odpowiadaj **krótko, konkretnie i na temat**. Bez lania wody i zbędnych wstępów.
- Domyślnie po polsku.
- Bez zbędnego formatowania; listy tylko gdy realnie pomagają.
- Najpierw wynik / odpowiedź, potem ewentualnie 1–2 zdania kontekstu.
- Nie tłumacz oczywistości i nie streszczaj tego, co użytkownik już wie.

## Co to jest
AquaMap — PWA z mapą basenów/pływalni w Polsce. Przeglądanie basenów (mapa +
lista), godziny, cennik, harmonogram torów. Społeczność współtworzy dane
(moderacja, rola `trusted`). Integracja Strava: treningi pływackie + EXP/poziomy.

## Stack
Vite + vanilla JS (ES modules), Mapbox GL, Supabase (Auth, Postgres+RLS, Storage,
Edge Functions), hosting Vercel, PWA (manifest + service worker). n8n scrapuje
harmonogramy.

## Skróty
- `npm run dev` — dev server
- `npm run build` — build (output: `dist/`)
- `npm run typecheck` — tsc --noEmit
- `npm run test` — vitest

## Struktura
- `js/` — logika frontendu (`app.js` = główny, ~686 linii; `map.js`, `schedule.js`,
  `auth*.js`, `contributions.js`, `moderationUI.js`, `strava.js`, `trainingsUI.js`,
  `gamification.js`, `photos*.js`, itd.)
- `supabase/migrations/` — `0001` profile, `0002` contributions+moderacja,
  `0003` harmonogramy, `0004` strava+xp, `0005` zdjęcia
- `supabase/functions/` — `strava-exchange`, `strava-sync` (Edge Functions)
- `docs/` — PLAN + dokumenty SETUP (faza 0, faza 4)

## Produkcja
- **Adres produkcyjny: https://aqua-map.vercel.app** (publiczny, działa).
- `aqua-map-mu.vercel.app` — MARTWY host (404), nie używać.
- Vercel projekt: `aqua-map` (team `gmarczaks-projects`). Vercel Authentication
  włączone → adresy preview/branch za logowaniem.
- Supabase projekt AquaMap: `yxjnjrborhatabnmjlqe` („gmarczak's Project").

## Stan / do zrobienia (P0 konfiguracja)
- ✅ Migracje wprowadzone. ✅ Build + frontend działają na produkcji.
- Redirect URLs (Supabase Auth) i Authorization Callback Domain (Strava) muszą
  wskazywać `aqua-map.vercel.app`.
- Potwierdzić zmienne w Vercelu (Production): `VITE_MAPBOX_ACCESS_TOKEN`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRAVA_CLIENT_ID`.
- Sekrety Strava (`STRAVA_CLIENT_SECRET`) tylko w Edge Functions — nigdy w buildzie.

## Luki wg planu (P1, jeszcze nie w kodzie)
- Rate-limiting w Edge Functions.
- Ostrzeżenie o duplikacie basenu (~150 m) przy dodawaniu.
- Dzienny limit EXP + minimalny dystans/czas (anty-farming).
- Cienkie pokrycie testami (moderacja, EXP, mapa, zgłoszenia).

## Zasady bezpieczeństwa danych
- Klient nigdy nie pisze wprost do „żywych" danych ani nie widzi sekretów.
- Zapisy idą przez `contributions` + RLS; `apply_contribution` (SECURITY DEFINER)
  scala do `places`/`harmonogram_torow`.
- `xp`/`level` i tokeny integracji — tylko zapis serwerowy (rola serwisowa).
- Sanityzacja: używać istniejących `escapeHtml` / `safeUrl`.

Pełna, priorytetyzowana lista zadań: patrz artefakt „AquaMap — lista zadań".
