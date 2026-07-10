// @ts-nocheck
import { listPending, reviewContribution } from './contributions.js';

const KIND_LABEL = {
    new_place: 'Nowy basen',
    edit_place: 'Edycja',
    schedule: 'Harmonogram',
    photo: 'Zdjęcie'
};

function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

// Czytelny podgląd payloadu (pomijamy puste pola).
function renderPayload(payload) {
    return Object.entries(payload || {})
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `<div><span class="mod-k">${esc(k)}:</span> ${esc(v)}</div>`)
        .join('') || '<em>—</em>';
}

function renderItem(c) {
    return `
        <div class="mod-item" data-id="${esc(c.id)}">
            <div class="mod-kind">${KIND_LABEL[c.kind] || esc(c.kind)}${c.place_id ? ` · basen #${esc(c.place_id)}` : ''}</div>
            <div class="mod-payload">${renderPayload(c.payload)}</div>
            <div class="mod-actions">
                <button class="btn-approve" data-id="${esc(c.id)}" type="button">Zatwierdź</button>
                <button class="btn-reject" data-id="${esc(c.id)}" type="button">Odrzuć</button>
            </div>
        </div>
    `;
}

async function refresh() {
    const list = document.getElementById('mod-list');
    list.innerHTML = '<p class="modal-sub">Ładowanie…</p>';
    try {
        const items = await listPending();
        list.innerHTML = items.length
            ? items.map(renderItem).join('')
            : '<p class="modal-sub">Brak zgłoszeń do przeglądu. 🎉</p>';
    } catch (error) {
        list.innerHTML = `<p class="modal-sub">Błąd: ${esc(error.message || error)}</p>`;
    }
}

export function openModerationPanel() {
    document.getElementById('mod-modal').classList.remove('hidden');
    refresh();
}

export function setupModerationUI() {
    const modal = document.getElementById('mod-modal');
    const close = () => modal.classList.add('hidden');

    document.getElementById('mod-modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            close();
        }
    });

    document.getElementById('mod-list').addEventListener('click', async event => {
        const btn = event.target.closest('.btn-approve, .btn-reject');
        if (!btn) {
            return;
        }
        const approve = btn.classList.contains('btn-approve');
        btn.disabled = true;
        try {
            await reviewContribution(btn.dataset.id, approve ? 'approved' : 'rejected');
            await refresh();
        } catch (error) {
            btn.disabled = false;
            alert(`Nie udało się: ${error.message || error}`);
        }
    });
}
