export async function loadEnvironment() {
    const response = await fetch('./env.local.json', { cache: 'no-store' });

    if (!response.ok) {
        throw new Error('Nie mozna wczytac pliku env.local.json. Sprawdz czy plik istnieje w glownym folderze projektu (skopiowany z env.local.example.json, z wypelnionymi wartosciami) i czy uruchamiasz aplikacje przez serwer (nie przez file://).');
    }

    const env = await response.json();
    window.__AQUAMAP_ENV__ = env;
}