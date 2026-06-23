import { initMap, addMarker, flyToLocation, map } from './map.js';
import { fetchPlaces, fetchSchedule } from './database.js';
import { renderScheduleTable } from './schedule.js';
import { escapeHtml, safeUrl } from './utils.js';

initMap('map');

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
            <p><strong>💰 Cennik:</strong> ${escapeHtml(place.cennik)}</p>
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

function setupSearch() {
    const searchInput = document.getElementById('search-input');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();

        document.querySelectorAll('.place-item').forEach(item => {
            const matches = item.textContent.toLowerCase().includes(query);
            item.style.display = matches ? '' : 'none';
        });
    });
}


async function startApp() {
    const listElement = document.getElementById('places-list');

    document.getElementById('back-button').addEventListener('click', showList);

    let places;
    try {
        places = await fetchPlaces();
    } catch {
        listElement.innerHTML = '<li class="places-info places-error">Nie udało się wczytać danych. Sprawdź połączenie i odśwież stronę.</li>';
        return;
    }

    listElement.innerHTML = '';

    if (places.length === 0) {
        listElement.innerHTML = '<li class="places-info">Brak basenów do wyświetlenia.</li>';
        return;
    }

    places.forEach(place => {
        addMarker(place, () => showDetails(place));

        const listItem = document.createElement('li');
        listItem.textContent = place.nazwa;
        listItem.classList.add('place-item');

        listItem.addEventListener('click', () => {
            flyToLocation(place.lat, place.lng);
            showDetails(place);
        });

        listElement.appendChild(listItem);
    });

    setupSearch();
}

map.on('load', startApp);

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