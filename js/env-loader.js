function parseEnvLine(line) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
        return null;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
        return null;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
    }

    return [key, value];
}

export async function loadEnvironment() {
    const response = await fetch('./.env', { cache: 'no-store' });

    if (!response.ok) {
        throw new Error('Nie mozna wczytac pliku .env. Uruchom aplikacje przez serwer, nie przez file://.');
    }

    const envText = await response.text();
    const env = {};

    for (const line of envText.split(/\r?\n/)) {
        const entry = parseEnvLine(line);

        if (!entry) {
            continue;
        }

        const [key, value] = entry;
        env[key] = value;
    }

    window.__AQUAMAP_ENV__ = env;
}
