/** Wspólne klasy pól i przycisków (tokeny z app/globals.css). */
const fieldBox = "h-12 w-full rounded-xl border border-border bg-surface text-base text-text placeholder:text-muted";
export const field = `${fieldBox} px-4`;
/** Wąskie pole liczby (serie): mniejszy margines, tekst na środku. */
export const fieldNarrow = `${fieldBox} px-2 text-center`;
/** Pole z ikoną lupy po lewej. */
export const fieldSearch = `${fieldBox} pl-11 pr-4`;
export const label = "flex flex-col gap-1.5";
export const labelText = "text-sm font-semibold";
export const errorText = "text-sm text-danger";
export const btnPrimary =
  "inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 font-semibold text-accent-contrast disabled:opacity-60";
export const btnSecondary =
  "inline-flex h-12 items-center justify-center rounded-full border-[1.5px] border-control px-6 font-semibold text-text disabled:opacity-50";
export const btnDangerSmall =
  "inline-flex h-10 items-center justify-center rounded-full border-[1.5px] border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50";
export const btnDanger =
  "inline-flex h-12 items-center justify-center rounded-full border-[1.5px] border-danger px-6 font-semibold text-danger disabled:opacity-50";
export const btnQuiet = "inline-flex h-11 items-center justify-center rounded-full px-4 font-medium text-muted";
export const sectionTitle = "font-serif text-lg font-semibold";
export const chip = (on: boolean) =>
  `inline-flex h-11 items-center justify-center rounded-full border-[1.5px] px-4 text-sm font-semibold ${
    on ? "border-accent bg-accent text-accent-contrast" : "border-border text-text"
  }`;
