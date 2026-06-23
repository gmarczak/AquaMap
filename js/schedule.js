import { escapeHtml } from './utils.js';

// Kolejność tygodnia (poniedziałek pierwszy).
const DNI = [
    { key: 'pon', label: 'Pon' },
    { key: 'wt', label: 'Wt' },
    { key: 'sr', label: 'Śr' },
    { key: 'czw', label: 'Czw' },
    { key: 'pt', label: 'Pt' },
    { key: 'sob', label: 'Sob' },
    { key: 'nd', label: 'Nd' }
];
const DNI_KEYS = DNI.map(d => d.key);

// Date.getDay(): 0 = niedziela ... 6 = sobota
function kluczDzis() {
    const js = new Date().getDay();
    return js === 0 ? 'nd' : DNI_KEYS[js - 1];
}

function etykietaDnia(key) {
    const dzis = kluczDzis();
    if (key === dzis) return 'Dziś';
    const jutro = DNI_KEYS[(DNI_KEYS.indexOf(dzis) + 1) % 7];
    if (key === jutro) return 'Jutro';
    return (DNI.find(d => d.key === key) || { label: key }).label;
}

function naMinuty(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// Renderuje harmonogram torów do kontenera DOM.
// sloty: znormalizowane wiersze { dzien, sekcja, tor, od, do, status, opis }.
// W bazie zapisane są sloty zajęte — rysujemy je na zielonym (wolnym) tle.
export function renderScheduleTable(container, sloty) {
    const zajete = sloty.filter(s => s.status !== 'wolny');

    // Zakres osi: od najwcześniejszego początku do najpóźniejszego końca
    // (zaokrąglony do pełnych godzin), z fallbackiem 6–22.
    const czasy = sloty.flatMap(s => [naMinuty(s.od), naMinuty(s.do)]).filter(n => !Number.isNaN(n));
    const minStart = czasy.length ? Math.min(...czasy) : 6 * 60;
    const maxEnd = czasy.length ? Math.max(...czasy) : 22 * 60;
    const OD = Math.floor(minStart / 60) * 60;
    const DO = Math.max(Math.ceil(maxEnd / 60) * 60, OD + 60);
    const ZAKRES = DO - OD;

    const procent = min => ((Math.min(Math.max(min, OD), DO) - OD) / ZAKRES) * 100;

    const godzin = ZAKRES / 60;
    const krok = godzin <= 7 ? 1 : godzin <= 14 ? 2 : 3;
    const znaczniki = [];
    for (let h = OD / 60; h <= DO / 60; h += krok) {
        znaczniki.push(h);
    }

    const sekcje = Array.from(new Set(sloty.map(s => s.sekcja).filter(Boolean)));
    const maSekcje = sekcje.length > 0;
    let aktywnaSekcja = maSekcje ? sekcje[0] : null;

    const dniZDanymi = DNI_KEYS.filter(k => sloty.some(s => s.dzien === k));
    let aktywnyDzien = dniZDanymi.includes(kluczDzis())
        ? kluczDzis()
        : (dniZDanymi[0] || kluczDzis());

    function toryDlaSekcji(sekcja) {
        return Array.from(new Set(
            sloty.filter(s => s.sekcja === sekcja).map(s => s.tor)
        )).sort((a, b) => a - b);
    }

    function rysujTor(tor) {
        const wpisy = zajete.filter(s =>
            s.dzien === aktywnyDzien && s.tor === tor && s.sekcja === aktywnaSekcja
        );

        const bloki = wpisy.map(w => {
            const left = procent(naMinuty(w.od));
            const width = procent(naMinuty(w.do)) - left;
            const tytul = `Tor ${tor}, ${w.od}–${w.do}${w.opis ? ' — ' + w.opis : ''}`;
            return `<div class="hs-busy" title="${escapeHtml(tytul)}" style="left:${left}%;width:${width}%;"></div>`;
        }).join('');

        return `
            <div class="hs-lane">
                <div class="hs-lane-label">Tor ${tor}</div>
                <div class="hs-lane-track">${bloki}</div>
            </div>
        `;
    }

    function rysuj() {
        const tabyDni = dniZDanymi.map(key => `
            <button type="button" class="hs-tab ${key === aktywnyDzien ? 'active' : ''}" data-dzien="${key}">${escapeHtml(etykietaDnia(key))}</button>
        `).join('');

        const segmenty = maSekcje ? `
            <div class="hs-sections">
                ${sekcje.map(s => {
                    const n = toryDlaSekcji(s).length;
                    return `<button type="button" class="hs-section-btn ${s === aktywnaSekcja ? 'active' : ''}" data-sekcja="${escapeHtml(s)}">${escapeHtml(s)} (${n})</button>`;
                }).join('')}
            </div>
        ` : '';

        const osZnaczniki = znaczniki.map(h =>
            `<span class="hs-axis-mark" style="left:${procent(h * 60)}%;">${String(h).padStart(2, '0')}:00</span>`
        ).join('');

        const tory = toryDlaSekcji(aktywnaSekcja);
        const wiersze = tory.length
            ? tory.map(rysujTor).join('')
            : '<p class="harmonogram-brak">Brak torów w tej sekcji.</p>';

        container.innerHTML = `
            <div class="hs-tabs">${tabyDni}</div>
            ${segmenty}
            <div class="hs-timeline">
                <div class="hs-axis"><span class="hs-axis-spacer"></span><div class="hs-axis-track">${osZnaczniki}</div></div>
                ${wiersze}
            </div>
            <div class="hs-legend">
                <span class="hs-legend-item"><span class="hs-dot hs-dot-free"></span>Wolny</span>
                <span class="hs-legend-item"><span class="hs-dot hs-dot-busy"></span>Zajęty</span>
            </div>
        `;

        container.querySelectorAll('.hs-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                aktywnyDzien = btn.dataset.dzien;
                rysuj();
            });
        });

        container.querySelectorAll('.hs-section-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                aktywnaSekcja = btn.dataset.sekcja;
                rysuj();
            });
        });
    }

    rysuj();
}
