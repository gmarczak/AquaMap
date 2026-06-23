import { initMap, addMarker, flyToLocation, map, geolocateControl } from './map.js';
import { fetchPlaces, fetchSchedule } from './database.js';
import { renderScheduleTable } from './schedule.js';
import { isOpenNow } from './openingHours.js';
import { distanceKm } from './geo.js';
import { safeUrl } from './utils.js';

initMap('map');

let allPlaces = [];
let userLocation = null;
let openNowOnly = false;

function waitForMapLoad() {
    return new Promise(resolve => {
        // Mapa mogła się już załadować zanim podepniemy listener — wtedy zdarzenie
        // 'load' już nie wystąpi, więc sprawdzamy stan i nie czekamy w nieskończoność.
        if (map.loaded()) {
            resolve();
        } else {
            map.once('load', resolve);
        }
    });
}

function updateOfflineBanner() {
    document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function brak(value) {
    return value === null || value === undefined || value === '' || value === 'Brak';
}

function renderChipy(place) {
    const chipy = [];

    if (!brak(place.ocena)) {
        chipy.push(`<span class="chip chip-rating">⭐ ${escapeHtml(place.ocena)}</span>`);
    }

    if (!brak(place.godziny)) {
        chipy.push(`<span class="chip chip-time">🕒 ${escapeHtml(place.godziny)}</span>`);

        const otwarte = isOpenNow(place.godziny);
        if (otwarte !== null) {
            chipy.push(otwarte
                ? '<span class="chip chip-open">Otwarte</span>'
                : '<span class="chip chip-closed">Zamknięte</span>');
        }
    }

    return `<div class="detail-chips">${chipy.join('')}</div>`;
}

// Cennik to swobodny tekst. Rozbijamy go na pozycje (po nowych liniach lub
// kropkach) i z każdej wydzielamy etykietę oraz cenę, by pokazać czytelną tabelę.
function pozycjaCennika(item) {
    const dwukropek = item.indexOf(':');
    if (dwukropek !== -1) {
        return { etykieta: item.slice(0, dwukropek).trim(), cena: item.slice(dwukropek + 1).trim() };
    }

    const cena = item.match(/(?:od\s*)?\d[\d\s–-]*z[łl][^,.;]*/i);
    if (cena) {
        const etykieta = item.slice(0, cena.index).replace(/[–-]\s*$/, '').trim();
        return { etykieta: etykieta || item.trim(), cena: cena[0].trim() };
    }

    return { etykieta: item.trim(), cena: '' };
}

function renderCennik(cennik) {
    if (brak(cennik)) {
        return '';
    }

    const wiersze = String(cennik)
        .split(/\n|(?<=\.)\s+/)
        .map(l => l.trim().replace(/\.$/, ''))
        .filter(Boolean)
        .map(item => {
            const { etykieta, cena } = pozycjaCennika(item);
            return `<tr><td class="cennik-etykieta">${escapeHtml(etykieta)}</td><td class="cennik-cena">${escapeHtml(cena)}</td></tr>`;
        })
        .join('');

    return `
        <div class="detail-section">
            <h4 class="section-title">Cennik</h4>
            <table class="cennik-tabela"><tbody>${wiersze}</tbody></table>
        </div>
    `;
}

function renderInfo(place) {
    const wiersze = [];

    if (!brak(place.klub)) {
        wiersze.push(`<p class="info-row"><span class="info-label">🏆 Klub</span><span>${escapeHtml(place.klub)}</span></p>`);
    }

    const stronaUrl = !brak(place.strona) ? safeUrl(place.strona) : null;
    if (stronaUrl) {
        wiersze.push(`<p class="info-row"><span class="info-label">🔗 Strona</span><a href="${escapeHtml(stronaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(place.strona)}</a></p>`);
    }

    if (wiersze.length === 0) {
        return '';
    }

    return `
        <div class="detail-section">
            <h4 class="section-title">Informacje</h4>
            ${wiersze.join('')}
        </div>
    `;
}

async function showDetails(place) {
    document.getElementById('list-view').classList.add('hidden');
    document.getElementById('details-view').classList.remove('hidden');

    const content = document.getElementById('details-content');
    content.innerHTML = `
        <div class="detail-card">
            <h3 class="detail-title">${escapeHtml(place.nazwa)}</h3>
            ${renderChipy(place)}
            <div class="detail-section">
                <h4 class="section-title">Harmonogram</h4>
                <div id="harmonogram-container" class="harmonogram-loading">Wczytywanie harmonogramu…</div>
            </div>
            ${renderCennik(place.cennik)}
            ${renderInfo(place)}
        </div>
    `;

    const harmonogramContainer = document.getElementById('harmonogram-container');

    let sloty;
    try {
        sloty = await fetchSchedule(place.id);
    } catch {
        harmonogramContainer.classList.remove('harmonogram-loading');
        harmonogramContainer.innerHTML = '<p class="harmonogram-blad">Nie udało się wczytać harmonogramu. Sprawdź połączenie i spróbuj ponownie.</p>';
        return;
    }

    harmonogramContainer.classList.remove('harmonogram-loading');
    if (sloty.length === 0) {
        harmonogramContainer.innerHTML = '<p class="harmonogram-brak">Brak danych o harmonogramie dla tego basenu.</p>';
    } else {
        renderScheduleTable(harmonogramContainer, sloty, place.liczba_torow || 0);
    }
}

function showList() {
    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('list-view').classList.remove('hidden');
}

function applySearchFilter() {
    const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('search-input'));
    const query = searchInput.value.trim().toLowerCase();

    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.place-item')).forEach(item => {
        const matches = item.textContent.toLowerCase().includes(query);
        item.style.display = matches ? '' : 'none';
    });
}

function setupSearch() {
    document.getElementById('search-input').addEventListener('input', applySearchFilter);
}

function setupOpenNowFilter() {
    document.getElementById('open-now-checkbox').addEventListener('change', event => {
        openNowOnly = /** @type {HTMLInputElement} */ (event.target).checked;
        renderList();
    });
}

function getVisiblePlaces() {
    let places = openNowOnly ? allPlaces.filter(place => isOpenNow(place.godziny) !== false) : allPlaces;

    if (userLocation) {
        places = [...places].sort((a, b) =>
            distanceKm(userLocation.lat, userLocation.lng, a.lat, a.lng)
            - distanceKm(userLocation.lat, userLocation.lng, b.lat, b.lng)
        );
    }

    return places;
}

function renderList() {
    const listElement = document.getElementById('places-list');
    const places = getVisiblePlaces();

    if (places.length === 0) {
        listElement.innerHTML = '<li class="places-error">Brak basenów spełniających kryteria.</li>';
        return;
    }

    listElement.innerHTML = '';

    places.forEach(place => {
        const listItem = document.createElement('li');
        listItem.textContent = userLocation
            ? `${place.nazwa} (${distanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng).toFixed(1)} km)`
            : place.nazwa;
        listItem.classList.add('place-item');

        listItem.addEventListener('click', () => {
            flyToLocation(place.lat, place.lng);
            showDetails(place);
        });

        listElement.appendChild(listItem);
    });

    applySearchFilter();
}

geolocateControl.on('geolocate', position => {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    renderList();
});

async function startApp() {
    const listElement = document.getElementById('places-list');

    try {
        [, allPlaces] = await Promise.all([waitForMapLoad(), fetchPlaces()]);
    } catch {
        listElement.innerHTML = '<li class="places-error">Nie udało się załadować danych. Sprawdź połączenie i odśwież stronę.</li>';
        return;
    }

    if (allPlaces.length === 0) {
        listElement.innerHTML = '<li class="places-error">Brak basenów do wyświetlenia.</li>';
        return;
    }

    document.getElementById('back-button').addEventListener('click', showList);

    allPlaces.forEach(place => addMarker(place, () => showDetails(place)));

    renderList();
    setupSearch();
    setupOpenNowFilter();
}

updateOfflineBanner();
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);

startApp();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('PWA: serviceworker zarejstrowany', registration);
        })
            .catch(error => {
                console.log('PWA: serviceworker nie zarejstrowany', error);
            });
    });
}