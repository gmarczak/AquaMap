import { submitNewPlace } from './contributions.js';
import { map } from './map.js';

let picked = null;

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
    document.getElementById('add-msg').textContent = '';
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

        msg.textContent = 'Wysyłam…';
        try {
            const row = await submitNewPlace(payload);
            msg.textContent = row.status === 'approved'
                ? 'Dodano! Basen pojawi się po odświeżeniu mapy.'
                : 'Dziękujemy! Zgłoszenie czeka na zatwierdzenie przez moderatora.';
        } catch (error) {
            msg.textContent = `Nie udało się wysłać: ${error.message || error}`;
        }
    });
}
