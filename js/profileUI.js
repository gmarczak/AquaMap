// @ts-nocheck
import { getProfile } from './auth.js';
import { supabase } from './supabaseClient.js';
import { levelProgress, getStats, getBadges, getLeaderboard } from './gamification.js';

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

async function render() {
    const body = document.getElementById('profile-body');
    body.innerHTML = '<p class="modal-sub">Ładowanie…</p>';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        body.innerHTML = '<p class="modal-sub">Zaloguj się, aby zobaczyć profil.</p>';
        return;
    }

    const profile = await getProfile(user.id);
    const prog = levelProgress(profile?.xp || 0);

    let stats = { trainings: 0, totalKm: 0, pools: 0, contributions: 0 };
    let badges = [];
    let leaderboard = [];
    try {
        stats = await getStats();
        badges = getBadges(stats);
        leaderboard = await getLeaderboard();
    } catch (error) {
        console.error('Profil:', error);
    }

    const badgesHtml = badges.map(b =>
        `<div class="badge ${b.unlocked ? '' : 'badge-locked'}"><span class="badge-icon">${b.icon}</span><span>${esc(b.label)}</span></div>`
    ).join('');

    const lbHtml = leaderboard.map((p, i) =>
        `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${esc(p.display_name || 'Anonim')}</span><span class="lb-xp">${esc(p.xp)} EXP · P${esc(p.level)}</span></div>`
    ).join('');

    body.innerHTML = `
        <div class="profile-head">
            <div class="profile-name">${esc(profile?.display_name || user.email)}</div>
            <div class="profile-level">Poziom ${prog.level} · ${prog.xp} EXP</div>
            <div class="level-bar"><div class="level-bar-fill" style="width:${prog.pct}%;"></div></div>
            <div class="level-hint">${prog.nextAt > prog.curFloor ? `${prog.nextAt - prog.xp} EXP do poziomu ${prog.level + 1}` : 'Maksymalny poziom'}</div>
        </div>
        <div class="profile-stats">
            <div><strong>${stats.trainings}</strong><span>treningi</span></div>
            <div><strong>${stats.totalKm.toFixed(1)}</strong><span>km</span></div>
            <div><strong>${stats.pools}</strong><span>baseny</span></div>
            <div><strong>${stats.contributions}</strong><span>zgłoszenia</span></div>
        </div>
        <h4 class="section-title">Odznaki</h4>
        <div class="badge-grid">${badgesHtml}</div>
        <h4 class="section-title">Ranking</h4>
        <div class="leaderboard">${lbHtml || '<p class="modal-sub">Brak danych.</p>'}</div>
    `;
}

export function openProfile() {
    document.getElementById('profile-modal').classList.remove('hidden');
    render();
}

export function setupProfileUI() {
    const modal = document.getElementById('profile-modal');
    const close = () => modal.classList.add('hidden');
    document.getElementById('profile-close').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            close();
        }
    });
}
