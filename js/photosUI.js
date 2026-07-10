// @ts-nocheck
import { uploadPhoto, listApprovedPhotos } from './photos.js';

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

// Renderuje sekcję zdjęć w szczegółach basenu i (dla zalogowanych) wpina upload.
export async function renderPhotos(place, currentUser) {
    const section = document.getElementById('photos-section');
    if (!section) {
        return;
    }

    let urls = [];
    try {
        urls = await listApprovedPhotos(place.id);
    } catch {
        /* brak zdjęć / błąd – pokazujemy pusto */
    }

    const gallery = urls.length
        ? `<div class="photo-gallery">${urls.map(u =>
            `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Zdjęcie basenu" loading="lazy"></a>`
          ).join('')}</div>`
        : '<p class="modal-sub">Brak zdjęć — dodaj pierwsze!</p>';

    const addCtl = currentUser
        ? `<button type="button" id="add-photo-btn" class="btn-secondary">📷 Dodaj zdjęcie</button>
           <input type="file" id="photo-input" accept="image/*" class="hidden">
           <p id="photo-msg" class="auth-msg"></p>`
        : '';

    section.innerHTML = `<h4 class="section-title">Zdjęcia</h4>${gallery}${addCtl}`;

    if (!currentUser) {
        return;
    }

    const input = document.getElementById('photo-input');
    const msg = document.getElementById('photo-msg');
    document.getElementById('add-photo-btn').addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) {
            return;
        }
        msg.textContent = 'Wysyłam zdjęcie…';
        try {
            const res = await uploadPhoto(place.id, file);
            if (res.status === 'approved') {
                msg.textContent = 'Dodano zdjęcie!';
                await renderPhotos(place, currentUser);
            } else {
                msg.textContent = 'Dziękujemy! Zdjęcie czeka na zatwierdzenie moderatora.';
            }
        } catch (error) {
            msg.textContent = `Nie udało się wysłać: ${error.message || error}`;
        }
        input.value = '';
    });
}
