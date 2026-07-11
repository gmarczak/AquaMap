# Webhook Strava — konfiguracja (Twoje kroki)

Cel: treningi aktualizują się automatycznie zaraz po dodaniu w Strava, bez
klikania „Synchronizuj". Ręczny sync zostaje jako zapas.

## 1. Sekret weryfikacyjny

Ustaw dowolny losowy token (dobierasz sam) — Strava odeśle go przy walidacji:

```bash
npx supabase secrets set STRAVA_VERIFY_TOKEN=jakis-losowy-ciag
```

(`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` musisz mieć już ustawione z Fazy 4.)

## 2. Wdróż funkcję — BEZ weryfikacji JWT

Webhook jest publiczny (woła go Strava, bez tokena Supabase), więc wyłącz
weryfikację JWT dla tej jednej funkcji:

```bash
npx supabase functions deploy strava-webhook --no-verify-jwt
```

Adres funkcji: `https://<ref-projektu>.supabase.co/functions/v1/strava-webhook`

## 3. Zarejestruj subskrypcję (jednorazowo)

Strava sama zawoła najpierw GET (walidacja), a potem będzie wysyłać zdarzenia.
Podmień `<...>` na swoje wartości i uruchom:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=<STRAVA_CLIENT_ID> \
  -F client_secret=<STRAVA_CLIENT_SECRET> \
  -F callback_url=https://<ref-projektu>.supabase.co/functions/v1/strava-webhook \
  -F verify_token=jakis-losowy-ciag
```

Sukces = odpowiedź z `id` subskrypcji. Błąd „callback url not verifiable"
oznacza, że funkcja nie odpowiada poprawnie na GET (sprawdź `--no-verify-jwt`
i czy `verify_token` się zgadza).

## Sprawdzenie / zarządzanie

```bash
# podejrzyj istniejącą subskrypcję
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=<STRAVA_CLIENT_ID> -d client_secret=<STRAVA_CLIENT_SECRET>

# usuń subskrypcję
curl -X DELETE "https://www.strava.com/api/v3/push_subscriptions/<id>?client_id=<..>&client_secret=<..>"
```

## Jak to działa

- **GET** — Strava przysyła `hub.challenge` + `hub.verify_token`; funkcja
  odsyła challenge tylko gdy token się zgadza.
- **POST** — przy zdarzeniu `activity` (create/update) funkcja znajduje
  użytkownika po `owner_id` (= `athlete_id` w `integrations`), odświeża token,
  pobiera trening; jeśli to `Swim`, zapisuje go i nalicza EXP (te same reguły
  co sync, w tym dzienny limit i minimalny dystans). Zawsze odsyła 200, żeby
  Strava nie ponawiała.
