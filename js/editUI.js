// @ts-nocheck
import { submitEditPlace } from './contributions.js';

let editingPlace = null;

const val = value => (value && value !== 'Brak') ? value : '';

export function openEditModal(place) {
    editingPlace = place;
    document.getElementById('edit-modal-place').textContent = place.nazwa;
    document.getElementById('edit-godziny').value = val(place.godziny);
    document.getElementById('edit-cennik').value = val(place.cennik);
    document.getElementById('edit-strona').value = val(place.strona);
    document.getElementById('edit-msg').textContent = '';
    document.getElementById('edit-modal').classList.remove('hidden');
}

export function setupEditUI() {
    const modal = document.getElementById('edit-modal');
    const close = () => modal.classList.add('hidden');

    document.getElementById('edit-modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            close();
        }
    });

    document.getElementById('edit-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!editingPlace) {
            return;
        }

        const msg = document.getElementById('edit-msg');
        const payload = {
            godziny: document.getElementById('edit-godziny').value.trim(),
            cennik: document.getElementById('edit-cennik').value.trim(),
            strona: document.getElementById('edit-strona').value.trim()
        };

        msg.textContent = 'Wysyłam…';
        try {
            const row = await submitEditPlace(editingPlace.id, payload);
            if (row?.status === 'approved') {
                document.dispatchEvent(new CustomEvent('aquamap:places-changed'));
                msg.textContent = 'Zapisano — zmiana jest już widoczna.';
            } else {
                msg.textContent = 'Dziękujemy! Zgłoszenie czeka na zatwierdzenie.';
            }
        } catch (error) {
            msg.textContent = `Nie udało się wysłać: ${error.message || error}`;
        }
    });
}
