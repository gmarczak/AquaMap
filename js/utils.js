// Drobne pomocniki współdzielone w aplikacji.

// Escapuje znaki specjalne HTML, aby dane z bazy nie mogły wstrzyknąć kodu
// przy wstawianiu przez innerHTML.
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Zwraca bezpieczny adres http(s) albo null. Blokuje m.in. javascript: i data:.
// Adresy bez schematu (np. "www.basen.pl") traktujemy jako https, żeby nie stały
// się linkiem względnym do naszej domeny.
export function safeUrl(value) {
    if (!value) {
        return null;
    }

    const raw = String(value).trim();
    const candidate = /^https?:\/\//i.test(raw)
        ? raw
        : /^[a-z][a-z0-9+.-]*:/i.test(raw)
            ? raw // inny schemat (mailto:, javascript: itp.) — odrzuci go kontrola protokołu poniżej
            : `https://${raw}`;

    try {
        const url = new URL(candidate);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
        }
    } catch {
        return null;
    }

    return null;
}
