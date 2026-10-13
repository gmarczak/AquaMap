# AquaMap

Baseny w Polsce, dziennik pływania i gra w jednym: za każdy trening EXP, poziomy, passa tygodniowa,
monety, przedmioty, questy tygodnia, wyprawy (Alcatraz → La Manche) i odznaki.
Połączenie dawnego AquaMap (mapa basenów) i AquaQuest (RPG dla pływaków), przepisane od zera.

## Funkcje

- **Dziennik**: trening ręcznie (dystans, czas, tempo /100 m, serie ze stylem, samopoczucie, notatka, basen, niecka 25/50) — działa offline,
  zapisuje się po powrocie sieci. Historia tygodniami, statystyki tygodnia.
- **Baseny**: ok. 850 obiektów z OpenStreetMap na mapie (MapLibre + OpenFreeMap, klastry) i liście (wyszukiwanie, „najbliższe”),
  godziny otwarcia z „otwarte teraz”, kontakt, nawigacja, Twoje treningi na danym basenie, „mój basen”.
- **Gra** (cała logika w Postgresie, klient nie może przyznać sobie nagród):
  - EXP = dystans/10 + minuty + 5 × seria (max 20), × (1 + passa% + ekwipunek%); passa +5%/tydzień do +25%
  - rekord tempa +50 EXP; nagrody za 2 pierwsze treningi dnia; tempo nie szybsze niż 1:00/100 m, max 10 km i 4 h
  - poziom: 200 × poziom EXP do następnego (max 50), skrzynka za każdy poziom
  - loot: 10% + 8%/km (max 60%), 12 przedmiotów w 4 rzadkościach, bonus % EXP lub monet (max +30% każdy)
  - sklep i sprzedaż za monety (1 moneta / 100 m), 3 questy tygodnia, 4 wyprawy, 9 odznak
  - usunięcie treningu cofa jego EXP, monety, przedmioty i ich sprzedaż (kaskada w księdze `swim.rewards`)
- **Strava** (i Garmin przez Stravę): OAuth, import 60 dni, webhook na nowe aktywności, bez dublowania treningów wpisanych ręcznie.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, TanStack Query (cache i kolejka offline w IndexedDB), Supabase (Postgres + RLS + RPC +
Edge Functions, schemat `swim` we wspólnym projekcie z Nawykami/Finansami/Garażem), MapLibre GL, Vercel, Vitest.

## Uruchomienie

```bash
cp .env.example .env.local
npm install
npm run dev
```

Schemat `swim` musi być wystawiony w Supabase: Integrations → Data API → Exposed schemas.

## Baza

- `supabase/migrations/` — `swim_init` (tabele, RLS, gra, sklep, questy), `swim_osm_import` (import basenów).
- `supabase/tests/behavior.sql` — nagrody, limity, sklep, questy, RLS, kaskady (CI na Postgresie 17).
- Import basenów: odpowiedź Overpass API → `select swim.import_osm(content::jsonb)` (przez `pg_net`, rola serwisowa).

## Strava

1. Aplikacja na https://www.strava.com/settings/api — *Authorization Callback Domain* = domena aplikacji.
2. Sekrety Edge Functions: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN` (dowolny losowy ciąg).
3. Vercel: `NEXT_PUBLIC_STRAVA_CLIENT_ID`.
4. W Ustawieniach (konto admina): „Admin: włącz webhook Stravy”.

Funkcja: `supabase/functions/aquamap-strava` (deploy z `verify_jwt = false` — webhook Stravy nie ma JWT; użytkownika sprawdza sama).

Dane basenów © współtwórcy OpenStreetMap, licencja ODbL.
