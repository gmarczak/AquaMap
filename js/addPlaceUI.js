// @ts-nocheck
import { submitNewPlace } from './contributions.js';
import { map, nearestPlace } from './map.js';

const DUPLICATE_RADIUS_M = 150;

let picked = null;
let duplicateConfirmed = false; // czy użytkownik potwierdził dodanie mimo duplikatu

function showHint(text) {
    let el = document.getElementById('map-hint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'map-hint';
        el.className = 'map-hint';
        document.getElementById('content').appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('hidden');
}

function clearHint() {
    document.getElementById('map-hint')?.classList.add('hidden');
}

function openAddModal(coords) {
    document.getElementById('add-form').reset();
    document.getElementById('add-tory').value = 6;
    document.getElementById('add-coords').textContent =
        `Lokalizacja: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;

    const msg = document.getElementById('add-msg');
    duplicateConfirmed = false;

    // Ostrzeżenie o możliwym duplikacie: istnieje basen w promieniu ~150 m.
    const near = nearestPlace(coords.lat, coords.lng);
    if (near && near.km * 1000 <= DUPLICATE_RADIUS_M) {
        const meters = Math.round(near.km * 1000);
        const nazwa = near.place.nazwa || 'istniejący basen';
        msg.textContent = `⚠️ ${meters} m stąd jest już „${nazwa}". Sprawdź, czy nie dodajesz duplikatu — jeśli to inny obiekt, kliknij „Dodaj".`;
    } else {
        msg.textContent = '';
    }

    document.getElementById('add-modal').classList.remove('hidden');
}

// Tryb wskazania punktu: następny klik na mapie ustala lokalizację nowego basenu.
export function startAddPlace() {
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    showHint('Kliknij na mapie miejsce basenu (Esc — anuluj)');

    function finish() {
        canvas.style.cursor = '';
        clearHint();
        map.off('click', onClick);
        document.removeEventListener('keydown', onKey);
    }
    function onClick(event) {
        picked = { lat: event.lngLat.lat, lng: event.lngLat.lng };
        finish();
        openAddModal(picked);
    }
    function onKey(event) {
        if (event.key === 'Escape') {
            finish();
        }
    }

    map.on('click', onClick);
    document.addEventListener('keydown', onKey);
}

export function setupAddPlaceUI() {
    const modal = document.getElementById('add-modal');
    const close = () => modal.classList.add('hidden');

    document.getElementById('add-modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            close();
        }
    });

    document.getElementById('add-form').addEventListener('submit', async event => {
        event.preventDefault();
        const msg = document.getElementById('add-msg');
        if (!picked) {
            msg.textContent = 'Najpierw wskaż miejsce na mapie.';
            return;
        }

        const payload = {
            nazwa: document.getElementById('add-nazwa').value.trim(),
            lat: picked.lat,
            lng: picked.lng,
            godziny: document.getElementById('add-godziny').value.trim(),
            cennik: document.getElementById('add-cennik').value.trim(),
            strona: document.getElementById('add-strona').value.trim(),
            liczba_torow: Number(document.getElementById('add-tory').value) || 6
        };

        if (!payload.nazwa) {
            msg.textContent = 'Podaj nazwę basenu.';
            return;
        }

        // Twarde ostrzeżenie o duplikacie: wymagamy drugiego kliknięcia.
        const near = nearestPlace(picked.lat, picked.lng);
        if (near && near.km * 1000 <= DUPLICATE_RADIUS_M && !duplicateConfirmed) {
            const meters = Math.round(near.km * 1000);
            const nazwa = near.place.nazwa || 'istniejący basen';
            msg.textContent = `⚠️ W promieniu ${meters} m istnieje już „${nazwa}". Kliknij „Dodaj" ponownie, aby dodać mimo to.`;
            duplicateConfirmed = true;
            return;
        }

        msg.textContent = 'Wysyłam…';
        try {
            const row = await submitNewPlace(payload);
            if (row.status === 'approved') {
                document.dispatchEvent(new CustomEvent('aquamap:places-changed'));
                msg.textContent = 'Dodano! Basen jest już na mapie.';
            } else {
                msg.textContent = 'Dziękujemy! Zgłoszenie czeka na zatwierdzenie przez moderatora.';
            }
        } catch (error) {
            msg.textContent = `Nie udało się wysłać: ${error.message || error}`;
        }
    });
}
