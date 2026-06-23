import { initMap, addMarker, flyToLocation, map, geolocateControl } from './map.js';
import { fetchPlaces, fetchSchedule } from './database.js';
import { renderScheduleTable } from './schedule.js';
import { isOpenNow } from './openingHours.js';
import { distanceKm } from './geo.js';

initMap('map');

let allPlaces = [];
let userLocation = null;
let openNowOnly = false;

function waitForMapLoad() {
    return new Promise(resolve => map.on('load', resolve));
}

function updateOfflineBanner() {
    document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const UDOGODNIENIA_META = {
    parking: '🅿️ Parking',
    gym: '🏋️ Siłownia',
    jacuzzi: '🛁 Jacuzzi',
    sauna: '🧖 Sauna',
    lockers: '🔐 Szafki',
    kids_pool: '🧒 Brodzik'
};

const TRUDNOSC_META = {
    easy: 'Łatwy',
    medium: 'Średni',
    hard: 'Trudny',
    legendary: 'Legendarny'
};

// Godziny otwarcia bywają puste w bazie — wtedy wyliczamy widełki z najwcześniejszego
// początku i najpóźniejszego końca slotów w harmonogramie.
function godzinyZHarmonogramu(sloty) {
    const czasy = sloty.flatMap(s => [s.od, s.do]).filter(Boolean);
    if (czasy.length === 0) {
        return null;
    }
    const od = czasy.reduce((a, b) => (a < b ? a : b));
    const doG = czasy.reduce((a, b) => (a > b ? a : b));
    return `${od} - ${doG}`;
}

function renderChipy(place, godziny) {
    const chipy = [];

    if (godziny) {
        chipy.push(`<span class="chip chip-time">🕒 ${escapeHtml(godziny)}</span>`);

        const otwarte = isOpenNow(godziny);
        if (otwarte !== null) {
            chipy.push(otwarte
                ? '<span class="chip chip-open">Otwarte</span>'
                : '<span class="chip chip-closed">Zamknięte</span>');
        }
    }

    if (place.dlugosc) {
        chipy.push(`<span class="chip">🏊 ${escapeHtml(place.dlugosc)} m</span>`);
    }
    if (place.trudnosc && TRUDNOSC_META[place.trudnosc]) {
        chipy.push(`<span class="chip">${escapeHtml(TRUDNOSC_META[place.trudnosc])}</span>`);
    }

    return `<div class="detail-chips">${chipy.join('')}</div>`;
}

function renderUdogodnienia(udogodnienia) {
    if (!udogodnienia || udogodnienia.length === 0) {
        return '';
    }
    const items = udogodnienia
        .map(a => `<span class="amenity">${escapeHtml(UDOGODNIENIA_META[a] || a)}</span>`)
        .join('');
    return `
        <div class="detail-section">
            <h4 class="section-title">Udogodnienia</h4>
            <div class="amenity-list">${items}</div>
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
            <div class="detail-chips"><span class="chip chip-muted">Wczytywanie…</span></div>
            <div class="detail-section">
                <h4 class="section-title">Harmonogram</h4>
                <div id="harmonogram-container" class="harmonogram-loading">Wczytywanie harmonogramu…</div>
            </div>
        </div>
    `;

    const sloty = await fetchSchedule(place.id);
    const godziny = place.godziny || godzinyZHarmonogramu(sloty);

    content.innerHTML = `
        <div class="detail-card">
            <h3 class="detail-title">${escapeHtml(place.nazwa)}</h3>
            ${renderChipy(place, godziny)}
            <div class="detail-section">
                <h4 class="section-title">Harmonogram</h4>
                <div id="harmonogram-container"></div>
            </div>
            ${renderUdogodnienia(place.udogodnienia)}
        </div>
    `;

    const harmonogramContainer = document.getElementById('harmonogram-container');
    if (sloty.length === 0) {
        harmonogramContainer.innerHTML = '<p class="harmonogram-brak">Brak danych o harmonogramie dla tego basenu.</p>';
    } else {
        renderScheduleTable(harmonogramContainer, sloty);
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