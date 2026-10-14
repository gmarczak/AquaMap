"use client";

import { useState, type FormEvent } from "react";
import { btnSecondary, field, label, labelText } from "@/components/ui/styles";
import { supabaseBrowser } from "@/lib/db/client";

const MIN_PASSWORD = 8;

/** Ustawienie lub zmiana hasła dla zalogowanego użytkownika (konta z linku z maila startują bez hasła). */
export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) return setStatus({ kind: "error", message: `Co najmniej ${MIN_PASSWORD} znaków.` });
    if (password !== repeat) return setStatus({ kind: "error", message: "Hasła się różnią." });
    setStatus({ kind: "busy" });
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      const message =
        error.code === "weak_password"
          ? "Hasło jest za słabe."
          : error.code === "same_password"
            ? "To hasło jest już ustawione."
            : error.status === 429
              ? "Za dużo prób. Odczekaj chwilę."
              : error.message;
      return setStatus({ kind: "error", message });
    }
    setPassword("");
    setRepeat("");
    setStatus({ kind: "done" });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Hasło pozwala logować się w aplikacji dodanej do ekranu głównego, gdzie link z maila nie działa.
      </p>
      <label className={label}>
        <span className={labelText}>Nowe hasło</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setStatus({ kind: "idle" });
          }}
          className={field}
        />
      </label>
      <label className={label}>
        <span className={labelText}>Powtórz hasło</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
            setStatus({ kind: "idle" });
          }}
          className={field}
        />
      </label>
      <button type="submit" disabled={status.kind === "busy" || !password} className={`${btnSecondary} self-start`}>
        {status.kind === "busy" ? "Zapisuję…" : "Ustaw hasło"}
      </button>
      {status.kind === "done" && <p className="text-sm font-semibold text-accent">Hasło ustawione. Możesz logować się nim w aplikacji.</p>}
      {status.kind === "error" && <p className="text-sm text-danger">{status.message}</p>}
    </form>
  );
}
