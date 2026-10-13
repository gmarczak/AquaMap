"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { btnPrimary, field, label, labelText } from "@/components/ui/styles";
import { supabaseBrowser } from "@/lib/db/client";

/*
 * Logowanie: e-mail + hasło (główne) albo link z maila (awaryjnie).
 * Na iPhonie aplikacja dodana do ekranu głównego ma osobną pamięć od Safari,
 * a link z maila zawsze otwiera Safari — dlatego w niej działa tylko hasło.
 * Hasło ustawia się w Ustawieniach po pierwszym zalogowaniu linkiem.
 */

type Mode = "password" | "signup" | "link";
type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string } | { kind: "info"; message: string };

const MIN_PASSWORD = 8;

function messageFor(error: { status?: number; message: string; code?: string }): string {
  if (error.status === 429) return "Za dużo prób w krótkim czasie. Odczekaj kilka minut i spróbuj ponownie.";
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message))
    return "Nieprawidłowy e-mail lub hasło. Jeśli konto zakładałeś linkiem z maila, najpierw ustaw hasło (poniżej).";
  if (error.code === "email_not_confirmed") return "Potwierdź adres e-mail linkiem z wiadomości, potem zaloguj się hasłem.";
  if (error.code === "user_already_exists" || /already registered/i.test(error.message))
    return "Konto z tym adresem już istnieje. Zaloguj się albo ustaw hasło.";
  if (error.code === "weak_password") return `Hasło jest za słabe. Użyj co najmniej ${MIN_PASSWORD} znaków.`;
  return error.message;
}

/** Aplikacja uruchomiona z ekranu głównego (PWA), a nie w przeglądarce. */
function useStandalone(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt środowiska dostępnego tylko w przeglądarce
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
  }, []);
  return standalone;
}

export function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const standalone = useStandalone();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(
    linkError
      ? { kind: "error", message: "Link wygasł albo został już użyty. Jeśli potwierdzałeś adres, zaloguj się hasłem." }
      : { kind: "idle" },
  );
  const busy = status.kind === "busy";

  function switchMode(next: Mode) {
    setMode(next);
    setStatus({ kind: "idle" });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const supabase = supabaseBrowser();
    const address = email.trim();
    setStatus({ kind: "busy" });

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      if (error) return setStatus({ kind: "error", message: messageFor(error) });
      router.replace("/");
      router.refresh();
      return;
    }

    if (mode === "signup") {
      if (password.length < MIN_PASSWORD) return setStatus({ kind: "error", message: `Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.` });
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) return setStatus({ kind: "error", message: messageFor(error) });
      // Adres już zarejestrowany: Supabase zwraca udawany sukces bez maila (ochrona przed sprawdzaniem adresów).
      // Rozpoznajemy to po pustej liście tożsamości i przełączamy na logowanie z wpisanymi danymi.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setMode("password");
        setStatus({
          kind: "info",
          message: "Konto z tym adresem już istnieje — kliknij Zaloguj. Nie pamiętasz hasła? Wybierz „Nie mam hasła / nie pamiętam”.",
        });
        return;
      }
      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }
      setPassword("");
      setMode("password");
      setStatus({
        kind: "info",
        message: "Konto założone. Potwierdź adres linkiem z maila (otworzy się w przeglądarce), potem zaloguj się tu hasłem.",
      });
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return setStatus({ kind: "error", message: messageFor(error) });
    setStatus({
      kind: "info",
      message: "Wysłaliśmy link. Otwórz go na tym urządzeniu, w tej samej przeglądarce. Po zalogowaniu ustaw hasło w Ustawieniach.",
    });
  }

  const title = mode === "signup" ? "Załóż konto" : mode === "link" ? "Link z maila" : "Zaloguj się";
  const submitLabel = mode === "signup" ? "Załóż konto" : mode === "link" ? "Wyślij link logowania" : "Zaloguj";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-4">
        <Image src="/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" priority />
        <h1 className="font-serif text-4xl font-semibold">AquaMap</h1>
        <p className="text-muted">Baseny, dziennik pływania i EXP za każdy trening. To samo konto co w Nawykach.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold">{title}</h2>

        {mode === "link" && standalone ? (
          <p className="rounded-2xl bg-surface px-4 py-3 text-sm">
            W aplikacji z ekranu głównego link z maila nie zaloguje — otworzy się w Safari, które ma osobne logowanie. Otwórz tę stronę w Safari, zaloguj się tam linkiem i ustaw hasło w Ustawieniach. Potem
            wróć tutaj i zaloguj się hasłem.
          </p>
        ) : (
          <>
            <label className={label}>
              <span className={labelText}>Adres e-mail</span>
              <input
                type="email"
                required
                autoComplete={mode === "signup" ? "email" : "username"}
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
              />
            </label>
            {mode !== "link" && (
              <label className={label}>
                <span className={labelText}>Hasło</span>
                <input
                  type="password"
                  required
                  minLength={mode === "signup" ? MIN_PASSWORD : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={field}
                />
                {mode === "signup" && <span className="text-xs text-muted">Co najmniej {MIN_PASSWORD} znaków.</span>}
              </label>
            )}
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Chwilę…" : submitLabel}
            </button>
          </>
        )}

        {status.kind === "error" && <p className="text-sm text-danger">{status.message}</p>}
        {status.kind === "info" && <p className="rounded-2xl bg-surface px-4 py-3 text-sm">{status.message}</p>}
      </form>

      <div className="flex flex-col items-start gap-3 text-sm font-semibold text-accent">
        {mode !== "password" && (
          <button type="button" onClick={() => switchMode("password")}>
            Mam hasło — zaloguj się
          </button>
        )}
        {mode !== "link" && (
          <button type="button" onClick={() => switchMode("link")}>
            Nie mam hasła / nie pamiętam
          </button>
        )}
        {mode !== "signup" && (
          <button type="button" onClick={() => switchMode("signup")}>
            Nie masz konta? Załóż je
          </button>
        )}
      </div>
    </main>
  );
}
