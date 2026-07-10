import { submitSchedule } from './contributions.js';

const DNI = [
    ['pon', 'Pon'], ['wt', 'Wt'], ['sr', 'Śr'], ['czw', 'Czw'],
    ['pt', 'Pt'], ['sob', 'Sob'], ['nd', 'Nd']
];

let place = null;
let entries = [];

function dayLabel(key) {
    return (DNI.find(d => d[0] === key) || [key, key])[1];
}

function renderEntries() {
    const box = document.getElementById('sched-entries');
    if (!entries.length) {
        box.innerHTML = '<p class="modal-sub">Brak wpisów. Dodaj zajęte przedziały powyżej.</p>';
        return;
    }
    box.innerHTML = entries.map((e, i) => `
        <div class="sched-row">
            <span>${dayLabel(e.dzien)} · Tor ${e.tor} · ${e.od}–${e.do}</span>
            <button type="button" class="sched-del" data-i="${i}" aria-label="Usuń">✕</button>
        </div>
    `).join('');
}

export function openScheduleEditor(p) {
    place = p;
    entries = [];
    document.getElementById('sched-place').textContent = p.nazwa;
    document.getElementById('sched-msg').textContent = '';
    document.getElementById('sched-replace').checked = false;
    renderEntries();
    document.getElementById('schedule-modal').classList.remove('hidden');
}

export function setupScheduleUI() {
    const modal = document.getElementById('schedule-modal');
    const close = () => modal.classList.add('hidden');

    document.getElementById('sched-modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            close();
        }
    });

    document.getElementById('sched-dzien').innerHTML =
        DNI.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

    document.getElementById('sched-add').addEventListener('click', () => {
        const msg = document.getElementById('sched-msg');
        const dzien = document.getElementById('sched-dzien').value;
        const tor = Number(document.getElementById('sched-tor').value);
        const od = document.getElementById('sched-od').value;
        const doo = document.getElementById('sched-do').value;

        if (!tor || !od || !doo) {
            msg.textContent = 'Uzupełnij tor i godziny.';
            return;
        }
        if (od >= doo) {
            msg.textContent = 'Godzina „od" musi być wcześniejsza niż „do".';
            return;
        }
        msg.textContent = '';
        entries.push({ dzien, tor, od, do: doo, status: 'zajecia' });
        renderEntries();
    });

    document.getElementById('sched-entries').addEventListener('click', event => {
        const del = event.target.closest('.sched-del');
        if (!del) {
            return;
        }
        entries.splice(Number(del.dataset.i), 1);
        renderEntries();
    });

    document.getElementById('schedule-form').addEventListener('submit', async event => {
        event.preventDefault();
        const msg = document.getElementById('sched-msg');
        if (!place) {
            return;
        }
        if (!entries.length) {
            msg.textContent = 'Dodaj przynajmniej jeden przedział zajętości.';
            return;
        }

        msg.textContent = 'Wysyłam…';
        try {
            const row = await submitSchedule(place.id, {
                replace: document.getElementById('sched-replace').checked,
                entries
            });
            msg.textContent = row.status === 'approved'
                ? 'Zapisano! Otwórz basen ponownie, by zobaczyć harmonogram.'
                : 'Dziękujemy! Zgłoszenie harmonogramu czeka na zatwierdzenie.';
        } catch (error) {
            msg.textContent = `Nie udało się wysłać: ${error.message || error}`;
        }
    });
}
