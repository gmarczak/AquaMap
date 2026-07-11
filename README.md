# AquaMap

PWA z mapą basenów i pływalni w Polsce. Przeglądanie basenów (mapa + lista),
godziny otwarcia, cennik, harmonogram torów. Społeczność współtworzy dane
(zgłoszenia + moderacja, rola `trusted`). Integracja ze Strava rejestruje
treningi pływackie i nalicza EXP/poziomy (grywalizacja).

**Produkcja:** https://aqua-map.vercel.app

## Stack

Vite + vanilla JS (ES modules), Mapbox GL, Supabase (Auth, Postgres + RLS,
Storage, Edge Functions), hosting Vercel, PWA (manifest + service worker).
Harmonogramy scrapuje n8n.

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env   # uzupełnij zmienne (niżej)
npm run dev            # http://localhost:5173
```

Skrypty: `npm run dev` · `npm run build` (→ `dist/`) · `npm run typecheck`
(tsc) · `npm run test` (vitest).

## Zmienne środowiskowe

W `.env` (lokalnie) oraz w Vercel → Project → Settings → Environment Variables
(Production). Wszystkie `VITE_*` są publiczne (trafiają do buildu frontendu):

```
VITE_MAPBOX_ACCESS_TOKEN=   # token Mapbox
VITE_SUPABASE_URL=          # URL projektu Supabase
VITE_SUPABASE_ANON_KEY=     # klucz anon (publiczny, chroniony przez RLS)
VITE_STRAVA_CLIENT_ID=      # Client ID aplikacji Strava (publiczny)
```

Sekret `STRAVA_CLIENT_SECRET` **nigdy** nie trafia do frontendu — tylko do
Supabase Edge Functions (poniżej).

## Struktura

```
js/                 logika frontendu (app.js główny; map, schedule, auth*,
                    contributions, moderationUI, strava, trainingsUI, itd.)
supabase/migrations/  0001 profile · 0002 contributions+moderacja · 0003 harmonogramy
                      0004 strava+xp · 0005 zdjęcia · 0006 limity EXP · 0007 rate-limit
                      0008 auto-awans trusted
supabase/functions/   strava-exchange, strava-sync, strava-webhook (Edge Functions, Deno)
supabase/tests/       verify.sql — audyt RLS + test apply_contribution
docs/                 PLAN + dokumenty SETUP
```

## Wdrożenie

### 1. Baza (Supabase)

Uruchom migracje `0001`–`0008` (SQL Editor → wklej pliki po kolei, lub
`npx supabase db push`). W **Authentication → URL Configuration**:

- **Site URL:** `https://aqua-map.vercel.app`
- **Redirect URLs:** `https://aqua-map.vercel.app/**` oraz `http://localhost:5173`

### 2. Edge Functions (Strava)

```bash
npx supabase link --project-ref <ref-projektu>
npx supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
npx supabase functions deploy strava-exchange strava-sync
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` są dostępne w
Edge Functions automatycznie.

Opcjonalnie webhook (push treningów zamiast ręcznego sync) — patrz
`docs/SETUP-webhook-strava.md`: `strava-webhook` wdrażasz z `--no-verify-jwt`,
ustawiasz sekret `STRAVA_VERIFY_TOKEN` i rejestrujesz subskrypcję w Strava.

### 3. Strava (panel aplikacji)

https://www.strava.com/settings/api → **Authorization Callback Domain:**
`aqua-map.vercel.app` (sama domena, bez `https://`).

### 4. Vercel

Projekt `aqua-map` (team `gmarczaks-projects`), auto-deploy z gałęzi `main`.
Ustaw zmienne `VITE_*` (Production) i przebuduj. Uwaga: włączone Vercel
Authentication chowa adresy preview/branch za logowaniem; publiczna jest
domena produkcyjna `aqua-map.vercel.app`.

## Testy

```bash
npm run test        # frontend (vitest): geo, schedule, contributions, database, openingHours
```

Baza: `supabase/tests/verify.sql` (SQL Editor) — audyt RLS oraz test
`apply_contribution` w transakcji z ROLLBACK (nie zapisuje danych).

## Bezpieczeństwo danych

- Klient nigdy nie pisze wprost do „żywych" danych ani nie widzi sekretów.
- Zapisy idą przez `contributions` + RLS; `apply_contribution` (SECURITY
  DEFINER) scala payload do `places` / `harmonogram_torow`.
- `xp`/`level` oraz tokeny integracji — zapis wyłącznie rolą serwisową.
- Edge Functions mają rate-limiting (`strava-sync` 6/godz., `strava-exchange`
  10/godz.); EXP ma dzienny limit (200) i minimalny dystans (100 m).
- Sanityzacja wejść: `escapeHtml` / `safeUrl`.

Pełna, priorytetyzowana lista zadań i stan projektu: patrz `CLAUDE.md`.
