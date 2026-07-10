import { supabase } from './supabaseClient.js';

// Próg wejścia na poziom n = 100 * n*(n-1)/2 (spójne z funkcją DB level_for_xp).
function xpForLevel(n) {
    return 100 * n * (n - 1) / 2;
}

export function levelProgress(xp) {
    const total = xp || 0;
    let level = 1;
    while (xpForLevel(level + 1) <= total) {
        level += 1;
    }
    const curFloor = xpForLevel(level);
    const nextAt = xpForLevel(level + 1);
    const pct = nextAt > curFloor
        ? Math.round(((total - curFloor) / (nextAt - curFloor)) * 100)
        : 100;
    return { level, xp: total, curFloor, nextAt, pct };
}

// Statystyki użytkownika: treningi, dystans, odwiedzone baseny, zatwierdzone zgłoszenia.
export async function getStats() {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: acts } = await supabase
        .from('activities')
        .select('distance_m, pool_place_id');
    const activities = acts || [];
    const totalM = activities.reduce((sum, a) => sum + (a.distance_m || 0), 0);
    const pools = new Set(activities.filter(a => a.pool_place_id).map(a => a.pool_place_id)).size;

    let contributions = 0;
    if (user) {
        const { count } = await supabase
            .from('contributions')
            .select('id', { count: 'exact', head: true })
            .eq('author', user.id)
            .eq('status', 'approved');
        contributions = count || 0;
    }

    return { trainings: activities.length, totalKm: totalM / 1000, pools, contributions };
}

const BADGES = [
    { icon: '🏊', label: 'Pierwszy trening', has: s => s.trainings >= 1 },
    { icon: '🔟', label: '10 treningów', has: s => s.trainings >= 10 },
    { icon: '🌊', label: '10 km w wodzie', has: s => s.totalKm >= 10 },
    { icon: '🐬', label: '50 km w wodzie', has: s => s.totalKm >= 50 },
    { icon: '🗺️', label: '5 basenów', has: s => s.pools >= 5 },
    { icon: '✍️', label: 'Współtwórca', has: s => s.contributions >= 1 },
    { icon: '🏅', label: '10 zgłoszeń', has: s => s.contributions >= 10 }
];

export function getBadges(stats) {
    return BADGES.map(b => ({ icon: b.icon, label: b.label, unlocked: b.has(stats) }));
}

export async function getLeaderboard() {
    const { data, error } = await supabase
        .from('profiles')
        .select('display_name, xp, level')
        .order('xp', { ascending: false })
        .limit(10);
    if (error) {
        throw error;
    }
    return data || [];
}
