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
  `0003` harmonogramy, `0004` strava+xp, `0005` zdjęcia, `0006` limity EXP,
  `0007` rate-limit, `0008` auto-awans `trusted`
- `supabase/functions/` — `strava-exchange`, `strava-sync`, `strava-webhook`
  (Edge Functions)
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

## Luki wg planu (P1)
- ✅ Ostrzeżenie o duplikacie basenu (~150 m) — `geo.nearestPlace` + `addPlaceUI`
  (potwierdzenie „dodaj mimo to"). Testy w `geo.test.js`.
- ✅ Dzienny limit EXP (200) + min. dystans 100 m — migracja `0006_anti_abuse.sql`
  (`award_activity_xp`); komunikaty w `strava-sync` + „Moje treningi".
- ✅ Rate-limiting w Edge Functions — migracja `0007_rate_limit.sql`
  (`consume_rate_limit`); `strava-sync` 6/godz., `strava-exchange` 10/godz.,
  odpowiedź 429 + komunikat dla użytkownika.
- ✅ Testy harmonogramu (`schedule`: `naMinuty`/`axisRange`/`axisTicks`/
  `lanesForSection`) + zgłoszeń (`contributions`: insert/kind/payload, moderacja).
- ⏳ Dalsze testy wymagające lokalnej bazy: `apply_contribution`, RLS (audyt);
  oraz wydzielenie testowalnej logiki z `app.js`.

## P2 (rozpoczęte)
- ✅ Auto-awans do `trusted` po 5 zatwierdzonych zgłoszeniach — migracja
  `0008_auto_promote.sql`.
- ✅ Webhook Strava (push zamiast ręcznego sync) — funkcja `strava-webhook`
  + `docs/SETUP-webhook-strava.md` (deploy `--no-verify-jwt`, rejestracja
  subskrypcji, sekret `STRAVA_VERIFY_TOKEN`).
- ⏳ Pozostałe P2: Garmin, historia zmian, monitoring kosztów, a11y/UX.

## Zasady bezpieczeństwa danych
- Klient nigdy nie pisze wprost do „żywych" danych ani nie widzi sekretów.
- Zapisy idą przez `contributions` + RLS; `apply_contribution` (SECURITY DEFINER)
  scala do `places`/`harmonogram_torow`.
- `xp`/`level` i tokeny integracji — tylko zapis serwerowy (rola serwisowa).
- Sanityzacja: używać istniejących `escapeHtml` / `safeUrl`.

Pełna, priorytetyzowana lista zadań: patrz artefakt „AquaMap — lista zadań".
