# Faza 0 — konfiguracja logowania (Twoje kroki w panelu)

Kod jest gotowy. Poniższe kroki wykonujesz raz w panelu Supabase / Google.

## 1. Uruchom migrację bazy

Supabase → **SQL Editor** → wklej zawartość `supabase/migrations/0001_profiles.sql`
→ **Run**. Utworzy tabelę `profiles`, RLS i trigger tworzący profil przy
rejestracji.

## 2. Adresy przekierowań (Auth → URL Configuration)

- **Site URL:** `http://localhost:5173` (do testów), docelowo adres z Vercela.
- **Redirect URLs (dodaj oba):**
  - `http://localhost:5173`
  - `https://<twoja-domena>.vercel.app`

## 3. Logowanie e-mail (magic link) — działa od razu

Auth → **Providers → Email** ma być włączone (domyślnie jest). To wystarcza, by
przetestować logowanie linkiem e-mail bez konfiguracji Google. Uwaga: darmowy
plan ma limit wysyłki maili.

## 4. Logowanie Google (opcjonalne, można później)

1. Google Cloud Console → utwórz **OAuth 2.0 Client ID** (typ: Web).
2. **Authorized redirect URI:** `https://<projekt>.supabase.co/auth/v1/callback`
   (dokładny adres pokazuje Supabase w Providers → Google).
3. Skopiuj **Client ID** i **Client Secret** do Supabase → Auth → Providers →
   **Google** → włącz i zapisz.

## 5. Uruchom i odśwież

```
npm run dev
```

Przy pierwszym wejściu po zmianach zrób **twardy refresh** (Ctrl+Shift+R) —
usunęliśmy rejestrację service workera w trybie dev, ale stary mógł zostać w
przeglądarce. Po tym w nagłówku pojawi się przycisk **„Zaloguj"**.

## Co już działa w kodzie

- Przycisk konta w nagłówku, modal z Google + linkiem e-mail.
- Po zalogowaniu: nazwa użytkownika + „Wyloguj", podgląd `Poziom / EXP`.
- Wspólny klient Supabase (zapytania niosą token zalogowanego — gotowe pod RLS).
- Automatyczne tworzenie profilu przy rejestracji; role/xp/level chronione przed
  edycją z klienta.
