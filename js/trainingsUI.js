// @ts-nocheck
import { connectStrava, syncStrava, listActivities, stravaConfigured } from './strava.js';

function fmtDist(m) {
    if (!m) {
        return '—';
    }
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtDuration(s) {
    if (!s) {
        return '—';
    }
    const min = Math.round(s / 60);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}min`;
}

function fmtDate(iso) {
    if (!iso) {
        return '';
    }
    return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

async function refresh() {
    const box = document.getElementById('trainings-list');
    box.innerHTML = '<p class="modal-sub">Ładowanie…</p>';
    try {
        const acts = await listActivities();
        if (!acts.length) {
            box.innerHTML = '<p class="modal-sub">Brak treningów. Połącz konto Strava i kliknij „Synchronizuj".</p>';
            return;
        }
        box.innerHTML = acts.map(a => `
            <div class="train-row">
                <div class="train-dist">🏊 ${fmtDist(a.distance_m)}</div>
                <div class="train-sub">${esc(fmtDate(a.start_time))} · ${esc(fmtDuration(a.duration_s))}${a.pool_place_id ? ` · basen #${esc(a.pool_place_id)}` : ''}</div>
            </div>
        `).join('');
    } catch (error) {
        box.innerHTML = `<p class="modal-sub">Błąd: ${esc(error.message || error)}</p>`;
    }
}

export function openTrainings() {
    document.getElementById('trainings-modal').classList.remove('hidden');
    document.getElementById('trainings-msg').textContent = '';
    refresh();
}

export function setupTrainingsUI() {
    const modal = document.getElementById('trainings-modal');
    const close = () => modal.classList.add('hidden');

    document.getElementById('trainings-close').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            close();
        }
    });

    const connectBtn = document.getElementById('strava-connect-btn');
    if (!stravaConfigured()) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Strava niedostępna (brak konfiguracji)';
    } else {
        connectBtn.addEventListener('click', () => connectStrava());
    }

    document.getElementById('strava-sync-btn').addEventListener('click', async () => {
        const msg = document.getElementById('trainings-msg');
        msg.textContent = 'Synchronizuję ze Strava…';
        try {
            const r = await syncStrava();
            msg.textContent = `Zsynchronizowano ${r.swims} treningów · +${r.awarded} EXP · poziom ${r.level}.`;
            await refresh();
        } catch (error) {
            msg.textContent = `Błąd synchronizacji: ${error.message || error}`;
        }
    });
}
