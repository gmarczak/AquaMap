import { escapeHtml } from './utils.js';

const DNI = [
    { key: 'pon', label: 'Pon' },
    { key: 'wt', label: 'Wt' },
    { key: 'sr', label: 'Śr' },
    { key: 'czw', label: 'Czw' },
    { key: 'pt', label: 'Pt' },
    { key: 'sob', label: 'Sob' },
    { key: 'nd', label: 'Nd' }
];

// Zakres wizualizowanego dnia — pasuje do godzin otwarcia większości basenów.
const DZIEN_OD = 6 * 60;
const DZIEN_DO = 23 * 60;
const ZAKRES = DZIEN_DO - DZIEN_OD;
const ZNACZNIKI_GODZIN = [6, 9, 12, 15, 18, 21];

const STATUS_META = {
    wolny: { label: 'Wolny', kolor: '#d5f5e3' },
    lekcja: { label: 'Zajęcia grupowe', kolor: '#fdebd0' },
    klub: { label: 'Trening klubowy', kolor: '#d6eaf8' },
    zamkniety: { label: 'Niedostępny', kolor: '#eaeded' }
};

function naMinuty(czas) {
    const [h, m] = czas.split(':').map(Number);
    return h * 60 + (m || 0);
}

function naProcent(minuty) {
    const ograniczone = Math.min(Math.max(minuty, DZIEN_OD), DZIEN_DO);
    return ((ograniczone - DZIEN_OD) / ZAKRES) * 100;
}

function skrocCzas(czas) {
    return czas.slice(0, 5);
}

function narysujTor(tor, wpisyTegoToru) {
    const segmenty = wpisyTegoToru
        .filter(w => w.status !== 'wolny')
        .map(w => {
            const start = naProcent(naMinuty(w.godzina_od));
            const koniec = naProcent(naMinuty(w.godzina_do));
            const meta = STATUS_META[w.status] || STATUS_META.wolny;
            const tytul = `Tor ${tor}, ${skrocCzas(w.godzina_od)}–${skrocCzas(w.godzina_do)} — ${meta.label}${w.opis ? ' · ' + w.opis : ''}`;
            return `<div class="segment" title="${escapeHtml(tytul)}" style="left:${start}%; width:${koniec - start}%; background:${meta.kolor};"></div>`;
        }).join('');

    return `
        <div class="tor-row">
            <div class="tor-label">Tor ${tor}</div>
            <div class="tor-track">${segmenty}</div>
        </div>
    `;
}

// Renderuje harmonogram torów do podanego kontenera DOM.
// harmonogram: wiersze z tabeli "harmonogram_torow" dla jednego basenu
//   (opcjonalne pole "sekcja", np. "Mała niecka" / "Duża niecka")
// liczbaTorow: ile torów ma basen, używane gdy harmonogram nie ma jeszcze wpisów
export function renderScheduleTable(container, harmonogram, liczbaTorow = 6) {
    let aktywnyDzien = 'pon';

    const sekcje = Array.from(new Set(harmonogram.map(w => w.sekcja || null)));
    const maSekcje = sekcje.length > 1 || (sekcje.length === 1 && sekcje[0] !== null);

    function listaTorowDlaSekcji(sekcja) {
        const tory = new Set(
            harmonogram.filter(w => (w.sekcja || null) === sekcja).map(w => w.tor)
        );
        if (tory.size === 0) {
            for (let i = 1; i <= liczbaTorow; i++) tory.add(i);
        }
        return Array.from(tory).sort((a, b) => a - b);
    }

    function narysuj() {
        const wierszeDnia = harmonogram.filter(w => w.dzien_tygodnia === aktywnyDzien);

        const zakladki = DNI.map(d => `
            <button type="button" class="dzien-tab ${d.key === aktywnyDzien ? 'active' : ''}" data-dzien="${d.key}">${d.label}</button>
        `).join('');

        const znaczniki = ZNACZNIKI_GODZIN.map(h =>
            `<span class="godzina-znacznik" style="left:${naProcent(h * 60)}%;">${h}</span>`
        ).join('');

        const osCzasu = `
            <div class="tor-row os-czasu">
                <div class="tor-label"></div>
                <div class="tor-track os-track">${znaczniki}</div>
            </div>
        `;

        let trescTorow;
        if (maSekcje) {
            trescTorow = sekcje.map(sekcja => {
                const tory = listaTorowDlaSekcji(sekcja);
                const wiersze = tory.map(tor => {
                    const wpisyToru = wierszeDnia.filter(w => w.tor === tor && (w.sekcja || null) === sekcja);
                    return narysujTor(tor, wpisyToru);
                }).join('');
                return `
                    <div class="sekcja-naglowek">${escapeHtml(sekcja || 'Tory')}</div>
                    ${wiersze}
                `;
            }).join('');
        } else {
            const tory = listaTorowDlaSekcji(null);
            trescTorow = tory.map(tor => {
                const wpisyToru = wierszeDnia.filter(w => w.tor === tor);
                return narysujTor(tor, wpisyToru);
            }).join('');
        }

        container.innerHTML = `
            <div class="harmonogram-tabs">${zakladki}</div>
            ${osCzasu}
            <div class="tory-lista">${trescTorow}</div>
            <div class="harmonogram-legenda">
                ${Object.entries(STATUS_META).map(([key, m]) => `
                    <span class="legenda-item"><span class="legenda-kolor" style="background:${m.kolor};"></span>${m.label}</span>
                `).join('')}
            </div>
        `;

        container.querySelectorAll('.dzien-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                aktywnyDzien = btn.dataset.dzien;
                narysuj();
            });
        });
    }

    narysuj();
}