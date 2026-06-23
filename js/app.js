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

// Cennik bywa zapisany jako kilka linijek (np. "Bilet 1h: 22 zł\nKarnet: 65 zł").
// Renderujemy to jako listę zamiast zlepiać w jeden ciąg tekstu.
function renderCennik(cennik) {
    if (!cennik || cennik === 'Brak') {
        return '<p><strong>💰 Cennik:</strong> Brak</p>';
    }

    const linie = cennik.split('\n').map(l => l.trim()).filter(Boolean);

    if (linie.length <= 1) {
        return `<p><strong>💰 Cennik:</strong> ${escapeHtml(cennik)}</p>`;
    }

    const pozycje = linie.map(linia => {
        const [etykieta, ...reszta] = linia.split(':');
        const wartosc = reszta.join(':').trim();
        return wartosc
            ? `<li><span class="cennik-etykieta">${escapeHtml(etykieta.trim())}</span><span class="cennik-wartosc">${escapeHtml(wartosc)}</span></li>`
            : `<li>${escapeHtml(linia)}</li>`;
    }).join('');

    return `
        <strong>💰 Cennik:</strong>
        <ul class="cennik-lista">${pozycje}</ul>
    `;
}

async function showDetails(place) {
    document.getElementById('list-view').classList.add('hidden');
    document.getElementById('details-view').classList.remove('hidden');

    const content = document.getElementById('details-content');
    const stronaUrl = place.strona && place.strona !== 'Brak' ? safeUrl(place.strona) : null;
    const stronaHtml = stronaUrl
        ? `<a href="${escapeHtml(stronaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(place.strona)}</a>`
        : 'Brak';

    content.innerHTML = `
        <div class="detail-card">
            <h3>${escapeHtml(place.nazwa)}</h3>
            <p><strong>🕒 Godziny:</strong> ${escapeHtml(place.godziny)}</p>
            <div class="cennik-blok">${renderCennik(place.cennik)}</div>
            <p><strong>⭐ Ocena:</strong> ${escapeHtml(place.ocena)}</p>
            <p><strong>🏆 Klub:</strong> ${escapeHtml(place.klub)}</p>
            <p><strong>🔗 Strona:</strong> ${stronaHtml}</p>
            <h4 class="harmonogram-tytul">Harmonogram torów</h4>
            <div id="harmonogram-container">Wczytywanie harmonogramu...</div>
        </div>
    `;

    const harmonogramContainer = document.getElementById('harmonogram-container');
    const harmonogram = await fetchSchedule(place.id);

    if (harmonogram.length === 0) {
        harmonogramContainer.innerHTML = '<p class="harmonogram-brak">Brak danych o harmonogramie dla tego basenu.</p>';
    } else {
        renderScheduleTable(harmonogramContainer, harmonogram, place.liczba_torow || 6);
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