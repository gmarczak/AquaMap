/**
 * Wygląd aplikacji: wybór zapisany na tym urządzeniu (localStorage). Domyślnie jasny.
 * Atrybut <html data-theme> ustawia THEME_SCRIPT przed pierwszym malowaniem, żeby nie było mignięcia.
 */
export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "aquamap-theme";
export const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Jasny" },
  { value: "dark", label: "Ciemny" },
  { value: "system", label: "Jak w telefonie" },
];

const LIGHT_BAR = "#f5f0e8";
const DARK_BAR = "#25272b";

/** Kod wstrzykiwany do <head>: odczyt wyboru i kolor paska przeglądarki. Bez zależności, odporny na brak localStorage. */
export const THEME_SCRIPT = `(function(){var t="light";try{var v=localStorage.getItem("${THEME_KEY}");if(v==="dark"||v==="system")t=v}catch(e){}var d=document.documentElement;d.dataset.theme=t;var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",dark?"${DARK_BAR}":"${LIGHT_BAR}")})();`;

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // tryb prywatny: wybór obowiązuje do zamknięcia aplikacji
  }
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? DARK_BAR : LIGHT_BAR);
}
