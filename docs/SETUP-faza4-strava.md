# Faza 4 — Strava + EXP: konfiguracja (Twoje kroki)

Backend jest gotowy (migracja + Edge Functions). Poniżej jednorazowa konfiguracja.
Frontend („Połącz ze Strava", „Moje treningi") dorobimy w następnym kroku — najpierw
musi istnieć wdrożony backend.

## 1. Zarejestruj aplikację Strava

1. Wejdź na https://www.strava.com/settings/api i utwórz aplikację.
2. **Authorization Callback Domain:** `localhost` (do testów). Później dodasz
   też domenę Vercela (np. `aqua-map.vercel.app`).
3. Zapisz **Client ID** i **Client Secret**.

## 2. Zmienna frontendu

W lokalnym `.env` dodaj (Client ID jest publiczny):

```
VITE_STRAVA_CLIENT_ID=twój_client_id
```

## 3. Migracja bazy

Supabase → SQL Editor → uruchom `supabase/migrations/0004_strava_xp.sql`
(tabele `integrations`, `activities`, `xp_events`, funkcje EXP/poziomu).

## 4. Sekrety Edge Functions

Wymaga Supabase CLI (https://supabase.com/docs/guides/cli). W folderze projektu:

```
supabase login
supabase link --project-ref yxjnjrborhatabnmjlqe
supabase secrets set STRAVA_CLIENT_ID=twój_client_id STRAVA_CLIENT_SECRET=twój_secret
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` są dostępne w
Edge Functions automatycznie — nie ustawiaj ich ręcznie.

## 5. Wdróż funkcje

```
supabase functions deploy strava-exchange
supabase functions deploy strava-sync
```

## Co robią funkcje

- **strava-exchange** — po zalogowaniu w Strava wymienia kod autoryzacyjny na
  tokeny (Client Secret zostaje na serwerze) i zapisuje je w `integrations` pod
  Twoim kontem. Tabela `integrations` jest niedostępna z przeglądarki (tylko
  rola serwisowa).
- **strava-sync** — odświeża token, pobiera ostatnie treningi typu „Swim",
  zapisuje je w `activities` (bez duplikatów), dopasowuje najbliższy basen po GPS
  (~200 m) i nalicza EXP: `10 + dystans/100 + 5 (seria) + 20 (nowy basen)`.

## Po wykonaniu

Napisz „gotowe" — dorobię frontend (przycisk „Połącz ze Strava", ekran „Moje
treningi", pasek poziomu/EXP) i przetestujemy pełny obieg na Twoim koncie Strava.
