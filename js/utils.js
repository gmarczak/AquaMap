// Drobne pomocniki współdzielone w aplikacji.

// Escapuje znaki specjalne HTML, aby dane z bazy nie mogły wstrzyknąć kodu
// przy wstawianiu przez innerHTML.
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Zwraca bezpieczny adres http(s) albo null. Blokuje m.in. javascript: i data:.
export function safeUrl(value) {
    if (!value) {
        return null;
    }

    try {
        const url = new URL(value, window.location.origin);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
        }
    } catch {
        return null;
    }

    return null;
}
