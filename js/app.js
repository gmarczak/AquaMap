import { initMap, setPlaces, flyToLocation, map, geolocateControl } from './map.js';
import { fetchPlaces, fetchSchedule } from './database.js';
import { renderScheduleTable } from './schedule.js';
import { isOpenNow, getTodayHours } from './openingHours.js';
import { distanceKm } from './geo.js';
import { safeUrl } from './utils.js';
import { setupAuthUI } from './authUI.js';
import { onAuthChange, getProfile } from './auth.js';
import { setupEditUI, openEditModal } from './editUI.js';
import { setupAddPlaceUI, startAddPlace } from './addPlaceUI.js';
import { setupModerationUI, openModerationPanel } from './moderationUI.js';
import { setupScheduleUI, openScheduleEditor } from './scheduleEditUI.js';
import { setupTrainingsUI, openTrainings } from './trainingsUI.js';
import { handleStravaRedirect } from './strava.js';
import { renderPhotos } from './photosUI.js';
import { setupProfileUI, openProfile } from './profileUI.js';

initMap('map');
setupAuthUI();
setupEditUI();
setupAddPlaceUI();
setupModerationUI();
setupScheduleUI();
setupTrainingsUI();
setupProfileUI();

document.getElementById('add-place-btn').addEventListener('click', startAddPlace);
document.getElementById('mod-btn').addEventListener('click', openModerationPanel);
document.getElementById('trainings-btn').addEventListener('click', () => {
    document.getElementById('account-menu').classList.add('hidden');
    openTrainings();
});
document.getElementById('profile-btn').addEventListener('click', () => {
    document.getElementById('account-menu').classList.add('hidden');
    openProfile();
});

// Powrót z autoryzacji Strava (?code=...): wymiana kodu, sync, pokaż treningi.
(async () => {
    try {
        if (await handleStravaRedirect()) {
            openTrainings();
        }
    } catch (error) {
        console.error('Strava:', error);
    }
})();

let allPlaces = [];
let userLocation = null;
let openNowOnly = false;
let currentUser = null;
const placeItems = new Map();

// Śledzimy stan logowania: „Dodaj basen" widoczne dla zalogowanych, „Moderacja"
// tylko dla moderatorów (trusted/admin). „Zaproponuj poprawkę" — patrz szczegóły.
onAuthChange(async user => {
    currentUser = user;
    const addBtn = document.getElementById('add-place-btn');
    const modBtn = document.getElementById('mod-btn');
    addBtn.classList.toggle('hidden', !user);
    if (user) {
        const profile = await getProfile(user.id);
        const isModerator = profile && (profile.role === 'trusted' || profile.role === 'admin');
        modBtn.classList.toggle('hidden', !isModerator);
    } else {
        modBtn.classList.add('hidden');
    }
});

function waitForMapLoad() {
    return new Promise(resolve => {
        // Mapa mogła się już załadować zanim podepniemy listener — wtedy zdarzenie
        // 'load' już nie wystąpi, więc sprawdzamy stan i nie czekamy w nieskończoność.
        if (map.loaded()) {
            resolve();
            return;
        }
        // Awaryjny timeout: gdyby mapa nie zainicjowała się (np. brak WebGL),
        // nie blokujemy w nieskończoność ładowania listy basenów.
        const timer = setTimeout(resolve, 4000);
        map.once('load', () => {
            clearTimeout(timer);
            resolve();
        });
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

// Pole "ocena" przychodzi z różnych źródeł w niespójnym formacie ("5/5", "5.0",
// "4.6"). Sprowadzamy wszystko do jednej skali X.X w stylu Google ("5/5" -> "5.0").
function formatRating(ocena) {
    if (brak(ocena)) {
        return null;
    }

    const match = String(ocena).match(/(\d+(?:[.,]\d+)?)/);
    if (!match) {
        return null;
    }

    const value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value.toFixed(1) : null;
}

// Baza nie ma kolumny z typem obiektu, więc kategorię szacujemy z nazwy —
// to przybliżenie, nie twarda klasyfikacja.
const CATEGORY_RULES = [
    { test: /aquapark|park wodny|water ?park/i, label: 'Aquapark', icon: '🌊' },
    { test: /hotel|spa|wellness|resort|termy|mercure|hilton|ibis|novotel|marriott|radisson|sheraton|qubus|turówka/i, label: 'Hotel / SPA', icon: '🏨' },
    { test: /odkryt|letni/i, label: 'Basen odkryty', icon: '☀️' },
    { test: /kryt/i, label: 'Basen kryty', icon: '🏊' }
];
const DEFAULT_CATEGORY = { label: 'Basen', icon: '🏊' };

function inferCategory(nazwa) {
    const rule = CATEGORY_RULES.find(({ test }) => test.test(nazwa || ''));
    return rule || DEFAULT_CATEGORY;
}

function renderChipy(place) {
    const chipy = [];

    const category = inferCategory(place.nazwa);
    chipy.push(`<span class="chip chip-type">${category.icon} ${escapeHtml(category.label)}</span>`);

    const ocena = formatRating(place.ocena);
    if (ocena) {
        chipy.push(`<span class="chip chip-rating">⭐ ${ocena}</span>`);
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

// Akcje społecznościowe w szczegółach — „Zaproponuj poprawkę" dla zalogowanych,
// zachęta do logowania dla gości.
function renderContributeFooter() {
    if (!currentUser) {
        return '<div class="detail-contribute"><button type="button" id="login-to-edit-btn" class="btn-secondary">Zaloguj się, aby zgłosić poprawkę</button></div>';
    }
    return `
        <div class="detail-contribute">
            <button type="button" id="propose-edit-btn" class="btn-secondary">✏️ Zaproponuj poprawkę</button>
            <button type="button" id="edit-schedule-btn" class="btn-secondary">🛠️ Edytuj harmonogram</button>
        </div>
    `;
}

async function showDetails(place) {
    document.getElementById('list-view').classList.add('hidden');
    document.getElementById('details-view').classList.remove('hidden');
    document.getElementById('back-button').textContent = `← ${place.nazwa}`;
    // Na telefonie rozwiń panel do górnego snapu, by szczegóły zajęły większość ekranu.
    setSheetHeightVh(SHEET_SNAP_VH[2]);
    document.getElementById('sidebar').scrollTop = 0;

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
            <div class="detail-section" id="photos-section"></div>
            ${renderContributeFooter()}
        </div>
    `;

    renderPhotos(place, currentUser);

    const editBtn = document.getElementById('propose-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => openEditModal(place));
    }
    const scheduleBtn = document.getElementById('edit-schedule-btn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', () => openScheduleEditor(place));
    }
    const loginBtn = document.getElementById('login-to-edit-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => document.getElementById('account-btn').click());
    }

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
    document.getElementById('back-button').textContent = '← Wstecz';
    // Na telefonie zwiń panel z powrotem do wysokości domyślnej (widok mapy + lista).
    setSheetHeightVh(SHEET_SNAP_VH[1]);
    // Przewiń panel z powrotem na górę po powrocie do listy
    document.getElementById('sidebar').scrollTop = 0;
}

function applySearchFilter() {
    const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('search-input'));
    const query = searchInput.value.trim().toLowerCase();

    let widoczne = 0;
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.place-item')).forEach(item => {
        const matches = (item.dataset.name || '').includes(query);
        item.style.display = matches ? '' : 'none';
        if (matches) {
            widoczne += 1;
        }
    });

    // Komunikat, gdy wpisano frazę, ale nic nie pasuje.
    const list = document.getElementById('places-list');
    let empty = document.getElementById('search-empty');
    if (query && widoczne === 0) {
        if (!empty) {
            empty = document.createElement('li');
            empty.id = 'search-empty';
            empty.className = 'places-info';
            empty.textContent = 'Brak basenów pasujących do wyszukiwania.';
            list.appendChild(empty);
        }
        empty.style.display = '';
    } else if (empty) {
        empty.style.display = 'none';
    }
}

function setActivePlace(activeItem) {
    document.querySelectorAll('.place-item.active').forEach(el => el.classList.remove('active'));
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

// Wspólna ścieżka wyboru basenu (z listy i z markera na mapie): podświetla
// pozycję na liście, przewija ją do widoku i otwiera szczegóły.
function selectPlace(place) {
    const item = placeItems.get(place.id);
    setActivePlace(item);
    item?.scrollIntoView({ block: 'nearest' });
    showDetails(place);
}

function renderSkeleton(listElement, count = 6) {
    listElement.innerHTML = Array.from({ length: count }, () =>
        '<li class="place-item skeleton"><span class="skel skel-title"></span><span class="skel skel-badge"></span></li>'
    ).join('');
}

function setupSearch() {
    document.getElementById('search-input').addEventListener('input', applySearchFilter);
}

function setupOpenNowFilter() {
    const chip = document.getElementById('open-now-chip');
    chip.addEventListener('click', () => {
        openNowOnly = !openNowOnly;
        chip.classList.toggle('active', openNowOnly);
        chip.setAttribute('aria-pressed', String(openNowOnly));
        renderList();
    });
}

const LOCATION_BANNER_DISMISSED_KEY = 'aquamap-location-banner-dismissed';

function setupLocationBanner() {
    const banner = document.getElementById('location-banner');

    if (sessionStorage.getItem(LOCATION_BANNER_DISMISSED_KEY)) {
        return;
    }

    banner.classList.remove('hidden');
    document.getElementById('location-banner-close').addEventListener('click', () => {
        banner.classList.add('hidden');
        sessionStorage.setItem(LOCATION_BANNER_DISMISSED_KEY, '1');
    });
}

function hideLocationBanner() {
    document.getElementById('location-banner').classList.add('hidden');
}

// Dolny panel na telefonach jako "bottom sheet": przeciągnięcie uchwytu zmienia
// wysokość panelu i po puszczeniu chwyta najbliższy z punktów zatrzaśnięcia.
const SHEET_SNAP_VH = [14, 38, 92];

// Czy jesteśmy w układzie mobilnym (bottom-sheet). Na desktopie sidebar ma stałą
// szerokość i pełną wysokość, więc nie ustawiamy mu wysokości w vh.
function isMobileSheet() {
    return window.matchMedia('(max-width: 768px)').matches;
}

// Płynnie ustawia wysokość dolnego panelu do zadanego punktu (w vh). Mapa (flex:1)
// przelicza swój rozmiar automatycznie dzięki ResizeObserverowi z initMap.
function setSheetHeightVh(vh) {
    if (!isMobileSheet()) {
        return;
    }
    const sidebar = document.getElementById('sidebar');
    sidebar.style.transition = 'height 0.3s cubic-bezier(0.2, 0, 0, 1)';
    sidebar.style.height = `${vh}vh`;
    window.setTimeout(() => { sidebar.style.transition = ''; }, 320);
}

function setupSheetDrag() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sheet-handle');

    let dragging = false;
    let startY = 0;
    let startHeightVh = SHEET_SNAP_VH[1];

    function currentHeightVh() {
        return (sidebar.getBoundingClientRect().height / window.innerHeight) * 100;
    }

    function setHeightVh(value) {
        sidebar.style.height = `${value}vh`;
    }

    function nearestSnap(value) {
        return SHEET_SNAP_VH.reduce((a, b) => Math.abs(b - value) < Math.abs(a - value) ? b : a);
    }

    handle.addEventListener('pointerdown', event => {
        dragging = true;
        startY = event.clientY;
        startHeightVh = currentHeightVh();
        sidebar.style.transition = 'none';
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
        if (!dragging) {
            return;
        }
        const deltaVh = ((startY - event.clientY) / window.innerHeight) * 100;
        const next = Math.min(92, Math.max(10, startHeightVh + deltaVh));
        setHeightVh(next);
        map.resize();
    });

    function endDrag() {
        if (!dragging) {
            return;
        }
        dragging = false;
        sidebar.style.transition = 'height 0.25s cubic-bezier(0.2, 0, 0, 1)';
        setHeightVh(nearestSnap(currentHeightVh()));
        map.resize();
        setTimeout(() => { sidebar.style.transition = ''; }, 260);
    }

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
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

    const countEl = document.getElementById('filter-count');
    if (countEl) {
        if (openNowOnly) {
            countEl.textContent = `${places.length} otwartych`;
            countEl.classList.remove('hidden');
        } else {
            countEl.classList.add('hidden');
        }
    }

    if (places.length === 0) {
        listElement.innerHTML = '<li class="places-error">Brak basenów spełniających kryteria.</li>';
        return;
    }

    listElement.innerHTML = '';
    placeItems.clear();

    places.forEach(place => {
        const listItem = document.createElement('li');
        listItem.classList.add('place-item');
        listItem.dataset.name = (place.nazwa || '').toLowerCase();
        placeItems.set(place.id, listItem);

        const badge = [];
        const ocena = formatRating(place.ocena);
        if (ocena) {
            badge.push(`<span class="place-badge badge-rating">⭐ ${ocena}</span>`);
        }
        const otwarte = isOpenNow(place.godziny);
        if (otwarte === true) {
            badge.push('<span class="place-badge badge-open">Otwarte</span>');
        } else if (otwarte === false) {
            badge.push('<span class="place-badge badge-closed">Zamknięte</span>');
        }
        if (!brak(place.godziny)) {
            const todayHours = getTodayHours(place.godziny);
            const hoursLabel = todayHours ? `Dziś: ${todayHours}` : place.godziny;
            badge.push(`<span class="place-hours">${escapeHtml(hoursLabel)}</span>`);
        }
        const dystans = userLocation
            ? `<span class="place-dist">${distanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng).toFixed(1)} km</span>`
            : '';

        const meta = (badge.length || dystans)
            ? `<div class="place-meta">${badge.join('')}${dystans}</div>`
            : '';

        const category = inferCategory(place.nazwa);
        listItem.innerHTML = `
            <span class="place-icon" aria-hidden="true">${category.icon}</span>
            <div class="place-main">
                <div class="place-name">${escapeHtml(place.nazwa)}</div>
                ${meta}
            </div>
        `;

        listItem.addEventListener('click', () => {
            flyToLocation(place.lat, place.lng);
            selectPlace(place);
        });

        listElement.appendChild(listItem);
    });

    applySearchFilter();
}

geolocateControl.on('geolocate', position => {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    hideLocationBanner();
    renderList();
});

// Ponowne pobranie basenów i odświeżenie mapy + listy — wołane po zatwierdzonym
// zgłoszeniu (dodanie/edycja/moderacja), żeby zmiana pojawiła się bez F5.
async function reloadPlaces() {
    try {
        allPlaces = await fetchPlaces();
        setPlaces(allPlaces, place => selectPlace(place));
        renderList();
    } catch (error) {
        console.error('Nie udało się odświeżyć basenów:', error);
    }
}
document.addEventListener('aquamap:places-changed', reloadPlaces);

async function startApp() {
    const listElement = document.getElementById('places-list');
    renderSkeleton(listElement);

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

    setPlaces(allPlaces, place => selectPlace(place));

    renderList();
    setupSearch();
    setupOpenNowFilter();
    setupLocationBanner();
    setupSheetDrag();
}

updateOfflineBanner();
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);

startApp();

// Service worker rejestrujemy tylko w wersji produkcyjnej. W trybie dev powodował
// serwowanie starego index.html/JS z cache (mylące „nic się nie zmienia").
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('PWA: serviceworker zarejstrowany', registration);
        })
            .catch(error => {
                console.log('PWA: serviceworker nie zarejstrowany', error);
            });
    });
}