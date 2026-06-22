import { initMap, addMarker, flyToLocation, map } from './map.js';
import { fetchPlaces } from './database.js';

initMap('map');

function showDetails(place) {
    document.getElementById('list-view').classList.add('hidden');
    document.getElementById('details-view').classList.remove('hidden');

    const content = document.getElementById('details-content');
    content.innerHTML = `
        <div class="detail-card">
            <h3>${place.nazwa}</h3>
            <p><strong>🕒 Godziny:</strong> ${place.godziny}</p>
            <p><strong>💰 Cennik:</strong> ${place.cennik}</p>
            <p><strong>⭐ Ocena:</strong> ${place.ocena}</p>
            <p><strong>🏆 Klub:</strong> ${place.klub}</p>
            <div style="margin-top: 15px; padding: 10px; background: #fdf2e9; border-left: 4px solid #e67e22; border-radius: 4px;">
                <p style="margin: 0; font-size: 0.9em;"><strong>Harmonogram torów:</strong><br>${place.harmonogram}</p>
            </div>
        </div>
    `;
}

function showList() {
    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('list-view').classList.remove('hidden');
}


async function startApp() {
    const listElement = document.getElementById('places-list');
    const places = await fetchPlaces();

    listElement.innerHTML = '';

    document.getElementById('back-button').addEventListener('click', showList);

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
