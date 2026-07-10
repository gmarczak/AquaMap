# AquaMap — plan: społeczność (crowdsourcing) + integracje Garmin/Strava

Dokument projektowy. Opisuje docelową architekturę rozbudowy AquaMap o
współtworzenie listy basenów przez zweryfikowanych użytkowników oraz o
rejestrację treningów z Garmin/Strava. Stack pozostaje bez zmian: frontend
Vite + mapbox-gl, backend Supabase (Postgres + Auth + Storage + Edge Functions),
hosting Vercel.

## 1. Decyzje bazowe

- **Weryfikacja:** logowanie przez Supabase Auth (Google + magic link e-mail).
  Rola `trusted` („zaufany") nadawana **hybrydowo/progowo**: po N zatwierdzonych
  zgłoszeniach użytkownik jest proponowany na zaufanego, a admin potwierdza
  jednym kliknięciem (opcjonalnie wyższy próg = auto-awans).
- **Moderacja:** zaufani publikują od razu; zgłoszenia zwykłych użytkowników
  trafiają do kolejki i czekają na akceptację.
- **Zakres współtworzenia:** nowe baseny, edycje istniejących, harmonogramy
  torów, zdjęcia.
- **Integracje:** Strava (priorytet, OAuth2), Garmin (po akceptacji w programie
  deweloperskim Garmin).

## 2. Architektura wysokopoziomowa

```
        Przeglądarka (PWA)
   ┌───────────────────────────┐
   │  mapa + lista + szczegóły │
   │  logowanie (Supabase JS)  │
   │  formularze zgłoszeń       │
   │  panel moderacji (admin)   │
   └───────────┬───────────────┘
               │ supabase-js (anon key, RLS)
               ▼
        ┌──────────────────────────────┐
        │           Supabase           │
        │  Auth  ·  Postgres + RLS      │
        │  Storage (zdjęcia)            │
        │  Edge Functions (sekrety)     │
        └───────┬───────────────┬──────┘
                │               │ client_secret, service role
                │               ▼
                │        Strava / Garmin API (OAuth, sync)
                ▼
     publiczny odczyt: tylko rekordy `status='published'`
```

Zasada bezpieczeństwa: **klient nigdy nie pisze bezpośrednio do „żywych" danych
ani nie widzi sekretów**. Zapisy idą przez tabele zgłoszeń + polityki RLS, a
integracje (client secret, tokeny) obsługują Edge Functions z rolą serwisową.

## 3. Model danych (Postgres / Supabase)

Do istniejących tabel `places` i `harmonogram_torow` dokładamy kolumny stanu i
autorstwa oraz nowe tabele. Poniżej szkic migracji.

```sql
-- Profile użytkowników (1:1 z auth.users), rola nadawana przez admina.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','trusted','admin')),
  created_at timestamptz not null default now()
);

-- Rozszerzenie istniejącej tabeli basenów o stan publikacji i autorstwo.
alter table places
  add column status text not null default 'published'
      check (status in ('published','pending','rejected','hidden')),
  add column created_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now();

-- Jedna kolejka zgłoszeń dla wszystkich typów wkładu.
create table contributions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_place','edit_place','schedule','photo')),
  place_id bigint references places(id) on delete cascade, -- null dla new_place
  payload jsonb not null,          -- proponowane pola / dane
  status text not null default 'pending'
      check (status in ('pending','approved','rejected')),
  author uuid not null default auth.uid() references auth.users(id),
  reviewer uuid references auth.users(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Zdjęcia basenów (plik w Storage; rekord widoczny dopiero po zatwierdzeniu).
create table place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id bigint not null references places(id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  author uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- Tokeny integracji (Strava/Garmin) — czytane tylko przez Edge Functions.
create table integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('strava','garmin')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  athlete_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Zsynchronizowane treningi (pływackie), opcjonalnie powiązane z basenem.
create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_id text not null,
  sport text,                       -- 'swimming', ...
  distance_m numeric,
  duration_s integer,
  start_time timestamptz,
  pool_place_id bigint references places(id),
  raw jsonb,
  unique (provider, external_id)
);
```

Uwaga o edycjach: zgłoszenie typu `edit_place` trzyma w `payload` tylko
proponowane zmiany (diff), więc żywy rekord w `places` nie jest nadpisywany aż
do zatwierdzenia. Zatwierdzenie wykonuje funkcja `apply_contribution`
(SECURITY DEFINER), która scala `payload` do `places` / `harmonogram_torow`.

## 4. RLS — zarys polityk

- **places:** `SELECT` dla wszystkich tylko gdy `status = 'published'`. Bez
  bezpośrednich `INSERT/UPDATE` z klienta — zmiany idą przez `contributions`
  i funkcję zatwierdzającą.
- **contributions:** `INSERT` dla zalogowanych z `author = auth.uid()`.
  `SELECT` własnych zgłoszeń przez autora; wszystkie widzi moderator
  (`role in ('trusted','admin')`). `UPDATE` (zatwierdź/odrzuć) tylko moderator.
- **Trigger auto-publikacji:** przy `INSERT` do `contributions`, jeśli autor ma
  rolę `trusted`/`admin`, zgłoszenie od razu dostaje `status='approved'` i
  wywoływana jest `apply_contribution` (efekt: publikacja natychmiastowa dla
  zaufanych, kolejka dla nowych).
- **profiles:** `SELECT` publiczny dla `display_name`,`role`; użytkownik edytuje
  własny `display_name`; zmiana `role` wyłącznie przez admina.
- **integrations:** brak dostępu z klienta (`SELECT/INSERT/UPDATE` tylko rola
  serwisowa w Edge Functions). Tokeny nigdy nie trafiają do przeglądarki.
- **activities:** właściciel czyta własne (`user_id = auth.uid()`).
- **Storage `place-photos`:** upload dla zalogowanych do ścieżki
  `pending/<uid>/...`; publiczny odczyt tylko z `approved/...` (moderator
  przenosi plik przy akceptacji).

## 5. Kluczowe przepływy

**Dodanie nowego basenu (nowy użytkownik):** klik „Dodaj basen" → wybór punktu
na mapie + formularz → `INSERT contributions(kind='new_place', payload=...)` ze
`status='pending'` → widoczne w kolejce moderatora → po akceptacji
`apply_contribution` tworzy rekord w `places` ze `status='published'`.

**To samo dla zaufanego:** trigger ustawia `approved`, basen pojawia się na
mapie od razu.

**Edycja istniejącego:** w szczegółach „Zaproponuj poprawkę" → formularz z
polami wstępnie wypełnionymi → `contributions(kind='edit_place', place_id, payload=diff)`.
Zaufany = zmiana od razu, nowy = kolejka.

**Panel moderacji:** widok listy `pending` (nazwa, typ, autor, podgląd diff,
zdjęcie) z akcjami Zatwierdź / Odrzuć + notatka. Dostęp dla `trusted`/`admin`.

**Zdjęcie:** upload do `pending/<uid>/`, rekord `place_photos(status='pending')`;
po akceptacji plik ląduje w `approved/` i staje się publiczny.

## 6. Integracje Garmin / Strava

Cel: użytkownik łączy konto Strava/Garmin i widzi swoje ostatnie treningi
pływackie; opcjonalnie trening zostaje dopasowany do najbliższego basenu
(sygnał crowdsource: „ile treningów zarejestrowano w tym basenie").

**Strava (priorytet — OAuth2):**
1. Edge Function `strava-oauth-start` → redirect do Strava z `client_id`,
   scope `activity:read`.
2. Callback `strava-oauth-callback` → wymiana `code` na tokeny (z `client_secret`
   po stronie serwera) → zapis do `integrations`.
3. Edge Function `strava-sync` (na żądanie lub cron): pobiera ostatnie
   aktywności, filtruje `type = 'Swim'`, zapisuje do `activities`, odświeża token
   gdy wygasł. Docelowo webhook Strava dla push-aktualizacji.
4. Dopasowanie do basenu: **automatyczne po GPS** — po współrzędnych startu
   najbliższy basen (funkcja `distanceKm`, próg ~200 m) → `activities.pool_place_id`.
   Brak basenu w progu → trening zostaje bez powiązania (baseny kryte bywają bez
   sygnału GPS; można doprecyzować ręcznie później).

**Garmin (faza późniejsza — zależność zewnętrzna):** Garmin Connect wymaga
zaakceptowania w programie deweloperskim (Health/Activity API, OAuth1.0a).
Do czasu akceptacji: pominąć albo wspierać import pliku `.fit`/`.tcx` jako
obejście. Traktować jako osobny kamień milowy z ryzykiem terminu.

Sekrety (`client_secret`, tokeny) wyłącznie w zmiennych środowiskowych Edge
Functions / Supabase secrets — nigdy w buildzie frontendu.

## 7. Zmiany w UI

- Ekran logowania / menu konta (avatar, „Zaloguj przez Google").
- „Dodaj basen" (tryb wyboru punktu na mapie + formularz).
- „Zaproponuj poprawkę" w widoku szczegółów.
- Edytor harmonogramu torów (dla zaufanych / w zgłoszeniu).
- Upload zdjęć w szczegółach + galeria (tylko zatwierdzone).
- Panel moderacji (lista oczekujących, diff, akcje).
- Sekcja „Moje treningi" (po połączeniu Strava/Garmin) + odznaka „X treningów
  tutaj" na basenie.

## 8. Anty-nadużycia

- Wymagane logowanie do jakiegokolwiek zapisu; `author = auth.uid()` wymuszane
  przez RLS.
- Limit tempa zgłoszeń (np. licznik w oknie czasowym w Edge Function).
- Deduplikacja nowych basenów po odległości (ostrzeżenie, gdy istnieje basen w
  promieniu ~150 m).
- Walidacja pól (współrzędne w granicach PL, format godzin przez istniejący
  parser, sanityzacja tekstu — mamy już `escapeHtml`/`safeUrl`).
- Moderacja zdjęć przed publikacją (ochrona przed treściami niepożądanymi).

## 9. Fazy wdrożenia

> **MVP = Faza 0 + Faza 1** (zakres „średni"): logowanie, „Zaproponuj poprawkę"
> (godziny/cennik/strona), „Dodaj basen", kolejka moderacji + rola `trusted`.
> Harmonogramy, zdjęcia, integracje i grywalizacja wchodzą po MVP.

- **Faza 0 — Konta:** Supabase Auth (Google + magic link), tabela `profiles`,
  logowanie/wylogowanie w UI. Fundament pod wszystko dalej.
- **Faza 1 — Wkład tekstowy + moderacja:** kolumny stanu w `places`, tabela
  `contributions`, funkcja `apply_contribution`, RLS, formularze „Dodaj basen" /
  „Zaproponuj poprawkę", panel moderacji, rola `trusted` + auto-publikacja.
- **Faza 2 — Harmonogramy:** zgłoszenia `kind='schedule'` + edytor.
- **Faza 3 — Zdjęcia:** bucket Storage, upload, moderacja, galeria.
- **Faza 4 — Strava:** Edge Functions OAuth + sync, „Moje treningi",
  dopasowanie do basenu.
- **Faza 5 — Garmin:** po akceptacji w programie deweloperskim (lub import
  pliku jako tymczasowe obejście).

## 10. Trade-offy i co zrewidować przy skali

- **Jedna tabela `contributions` vs osobne tabele per typ:** wybrano jedną —
  prostszy jeden panel moderacji i wspólne RLS, kosztem `payload jsonb` bez
  twardego schematu. Przy dużej skali warto rozważyć walidację JSON (schema) lub
  rozbicie na tabele.
- **Pending w `places` vs w `contributions`:** nowe baseny trzymamy w
  `contributions` do czasu akceptacji, by `places` zawierało wyłącznie dane
  gotowe do publicznego odczytu (proste RLS, brak „przecieku" wersji roboczych).
- **Sync integracji: cron vs webhook:** start na sync „na żądanie/cron"
  (prościej), docelowo webhook Strava dla świeżości i mniejszego zużycia limitu.
- **Koszty:** darmowy Supabase ma limity (Storage, wywołania Edge Functions,
  liczba MAU). Zdjęcia i sync to główne pozycje — monitorować, w razie wzrostu
  włączyć płatny plan / CDN na obrazy.
- **Moderacja jako wąskie gardło:** przy wzroście liczby zgłoszeń rozważyć
  model reputacji (auto-awans do `trusted`) i moderację społecznościową.

## 11. Ryzyka i otwarte kwestie

- Garmin: zależność od akceptacji zewnętrznej — nieprzewidywalny termin.
- Moderacja zdjęć: potrzebny prosty proces (i ewentualnie automatyczny filtr
  treści) zanim włączymy upload publiczny.
- Prywatność danych treningowych: jasna zgoda przy łączeniu Strava/Garmin,
  dane widoczne tylko dla właściciela; powiązanie z basenem anonimizowane w
  licznikach.
- Jakość danych z crowdsourcingu: zachować historię zmian (kto, kiedy) do
  cofania wandalizmu.

## 12. Poziomy konta i EXP (gamifikacja)

W finalnym produkcie konto ma **poziom**, a użytkownik zdobywa **EXP za
treningi** (zsynchronizowane ze Strava/Garmin). Opcjonalnie EXP także za
zatwierdzone zgłoszenia — łączy grywalizację z crowdsourcingiem.

**Dane** (rozszerzenie `profiles`):

```sql
alter table profiles
  add column xp integer not null default 0,
  add column level integer not null default 1;

-- Log przyznanego EXP — audyt i ochrona przed podwójnym naliczeniem.
create table xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('activity','contribution')),
  ref_id text not null,            -- np. activities.id lub contributions.id
  amount integer not null,
  created_at timestamptz not null default now(),
  unique (source, ref_id)          -- jeden trening = jedno naliczenie
);
```

**Naliczanie — wieloczynnikowe (wyłącznie serwerowo, Edge Function przy synchronizacji):**
EXP to nie tylko dystans, żeby nagradzać regularność i eksplorację basenów:

- **Baza za trening:** +10 EXP za każdą zaliczoną sesję pływacką.
- **Dystans:** +1 EXP / 100 m (np. 1500 m → +15).
- **Seria dni (streak):** +5 EXP za każdy kolejny dzień z treningiem, do +25
  (5+ dni). Reset po przerwanym dniu.
- **Nowy basen:** +20 EXP za pierwszy zarejestrowany trening w danym basenie
  (spina grywalizację z odkrywaniem/uzupełnianiem mapy).

Przykład: 1500 m, 3. dzień serii, nowy basen → 10 + 15 + 15 + 20 = **60 EXP**.

Zabezpieczenia: minimalny dystans/czas (odcięcie „śmieciowych" wpisów), **dzienny
limit EXP** (anty-farmienie), `unique(source, ref_id)` blokuje podwójne naliczenie.
EXP i poziom liczone po stronie serwera (rola serwisowa); klient **nie może**
pisać do `xp`/`level` (RLS: odczyt własny/publiczny, zapis tylko serwis).

**Krzywa poziomów:** próg rosnący, np. `EXP_do_poziomu(n) = 100 * n * (n-1) / 2`
(poziom 2: 100, poziom 3: 300, poziom 4: 600…) — łagodny start, dłuższe kolejne
poziomy. Formuła do kalibracji po danych.

**UI:** pasek postępu poziomu w profilu, „+EXP" po synchronizacji treningu,
opcjonalnie odznaki (np. „10 basenów", „100 km") i ranking znajomych.

**Zależność:** wymaga Fazy 4 (integracje/`activities`). Sugerowana **Faza 6 —
Grywalizacja**: EXP za treningi → poziomy → odznaki/ranking.
