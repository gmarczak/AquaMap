import { escapeHtml } from './utils.js';

// ISO: 1 = poniedziałek ... 7 = niedziela
const DNI_SKROT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

function isoDzienDzis() {
    return ((new Date().getDay() + 6) % 7) + 1;
}

function naMinuty(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// Tory sortujemy numerycznie ("Tor 1".."Tor 6"), a etykiety bez numeru
// (np. "grzybek") lądują na końcu.
function sortTory(a, b) {
    const na = parseInt((a.match(/\d+/) || ['9999'])[0], 10);
    const nb = parseInt((b.match(/\d+/) || ['9999'])[0], 10);
    if (na !== nb) return na - nb;
    return a.localeCompare(b, 'pl');
}

// Renderuje harmonogram torów do kontenera DOM.
// sloty: znormalizowane wiersze { dzien, sekcja, tor, od, do, opis } — w bazie
//   zapisane są wyłącznie sloty ZAJĘTE; reszta osi to czas wolny.
export function renderScheduleTable(container, sloty) {
    // Zakres godzin osi: od najwcześniejszego początku do najpóźniejszego końca
    // (zaokrąglony do pełnych godzin), z rozsądnym fallbackiem 6–22.
    const czasy = sloty.flatMap(s => [naMinuty(s.od), naMinuty(s.do)]);
    const minStart = czasy.length ? Math.min(...czasy) : 6 * 60;
    const maxEnd = czasy.length ? Math.max(...czasy) : 22 * 60;
    const OD = Math.floor(minStart / 60) * 60;
    const DO = Math.max(Math.ceil(maxEnd / 60) * 60, OD + 60);
    const ZAKRES = DO - OD;

    const procent = min => ((Math.min(Math.max(min, OD), DO) - OD) / ZAKRES) * 100;

    // Znaczniki godzin — krok tak dobrany, by było ~4–7 etykiet.
    const godzin = ZAKRES / 60;
    const krok = godzin <= 7 ? 1 : godzin <= 14 ? 2 : 3;
    const znaczniki = [];
    for (let h = OD / 60; h <= DO / 60; h += krok) {
        znaczniki.push(h);
    }

    const sekcje = Array.from(new Set(sloty.map(s => s.sekcja).filter(Boolean)));
    const maSekcje = sekcje.length > 0;
    let aktywnaSekcja = maSekcje ? sekcje[0] : null;

    // Domyślnie pokazujemy dziś, ale jeśli brak danych na dziś — pierwszy dzień z danymi.
    const dniZDanymi = new Set(sloty.map(s => s.dzien));
    let aktywnyDzien = dniZDanymi.has(isoDzienDzis())
        ? isoDzienDzis()
        : (Math.min(...dniZDanymi) || isoDzienDzis());

    function toryDlaSekcji(sekcja) {
        const tory = new Set(
            sloty.filter(s => s.sekcja === sekcja).map(s => s.tor)
        );
        return Array.from(tory).sort(sortTory);
    }

    function etykietaDnia(dzien, idx) {
        const dzis = isoDzienDzis();
        const jutro = (dzis % 7) + 1;
        if (dzien === dzis) return 'Dziś';
        if (dzien === jutro) return 'Jutro';
        return DNI_SKROT[dzien - 1];
    }

    function rysujTor(tor) {
        const wpisy = sloty.filter(s =>
            s.dzien === aktywnyDzien && s.tor === tor && s.sekcja === aktywnaSekcja
        );

        const bloki = wpisy.map(w => {
            const left = procent(naMinuty(w.od));
            const width = procent(naMinuty(w.do)) - left;
            const tytul = `${w.tor}, ${w.od}–${w.do} — ${w.opis}`;
            return `<div class="hs-busy" title="${escapeHtml(tytul)}" style="left:${left}%;width:${width}%;"></div>`;
        }).join('');

        return `
            <div class="hs-lane">
                <div class="hs-lane-label">${escapeHtml(tor)}</div>
                <div class="hs-lane-track">${bloki}</div>
            </div>
        `;
    }

    function rysuj() {
        const dni = Array.from(dniZDanymi).sort((a, b) => a - b);

        const tabyDni = dni.map((d, i) => `
            <button type="button" class="hs-tab ${d === aktywnyDzien ? 'active' : ''}" data-dzien="${d}">${escapeHtml(etykietaDnia(d, i))}</button>
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

        const tory = maSekcje ? toryDlaSekcji(aktywnaSekcja) : toryDlaSekcji(null);
        const wiersze = tory.map(rysujTor).join('');

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
                aktywnyDzien = Number(btn.dataset.dzien);
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
