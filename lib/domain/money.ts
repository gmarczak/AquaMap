/**
 * Kwoty jako liczby całkowite w groszach (minor units). Nigdy ułamki: 0,1 + 0,2 ≠ 0,3.
 * Formatowanie po polsku: spacja nierozdzielająca co 3 cyfry, przecinek dziesiętny, „zł”.
 */

export type Minor = number;

const NBSP = " ";
const MINUS = "−"; // typograficzny minus

/**
 * Tekst z klawiatury lub pliku → grosze. Przyjmuje „38,50”, „38.5”, „1 234,56”, „-12”, „1.234,56”.
 * Zwraca null, gdy to nie jest kwota albo ma więcej niż 2 miejsca po przecinku.
 */
export function parseAmount(input: string): Minor | null {
  let s = input.replace(/[\s  ]/g, "").replace(/zł|pln/gi, "").replace(MINUS, "-");
  if (s === "") return null;
  const negative = s.startsWith("-");
  if (negative || s.startsWith("+")) s = s.slice(1);
  // Ostatni separator (, lub .) jest dziesiętny, jeśli stoją za nim 1–2 cyfry; inaczej wszystkie to tysiące.
  const decimalAt = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  let intPart = s;
  let fracPart = "";
  if (decimalAt !== -1 && /^\d{1,2}$/.test(s.slice(decimalAt + 1))) {
    intPart = s.slice(0, decimalAt);
    fracPart = s.slice(decimalAt + 1);
  }
  if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart || "0") || !/^\d{0,2}$/.test(fracPart)) return null;
  const value = Number(intPart || "0") * 100 + Number(fracPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export type FormatOptions = {
  /** "auto": grosze tylko gdy są; "always": zawsze ,00; "never": zaokrąglone do złotych */
  cents?: "auto" | "always" | "never";
  /** Pokaż „+” przy dodatnich (np. przychód) */
  plusSign?: boolean;
  currency?: string;
};

export function formatMoney(minor: Minor, opts: FormatOptions = {}): string {
  const { cents = "auto", plusSign = false, currency = "PLN" } = opts;
  const negative = minor < 0;
  let abs = Math.abs(minor);
  if (cents === "never") abs = Math.round(abs / 100) * 100;
  const zl = Math.floor(abs / 100);
  const gr = abs % 100;
  const showCents = cents === "always" || (cents === "auto" && gr !== 0);
  const number = groupThousands(String(zl)) + (showCents ? `,${String(gr).padStart(2, "0")}` : "");
  const sign = negative && abs !== 0 ? MINUS : plusSign && abs !== 0 ? "+" : "";
  const unit = currency === "PLN" ? "zł" : currency;
  return `${sign}${number}${NBSP}${unit}`;
}

/** Procent wykorzystania (0–∞), zaokrąglony w dół, żeby 99,6% nie pokazywało „100%”. */
export function percent(part: Minor, whole: Minor): number {
  if (whole <= 0) return 0;
  return Math.floor((part / whole) * 100);
}
