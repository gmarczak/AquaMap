import { supabase } from './supabaseClient.js';
import { SUPABASE_URL, STRAVA_CLIENT_ID } from './config.js';

export function stravaConfigured() {
    return !!STRAVA_CLIENT_ID;
}

// Lokalny znacznik połączenia ze Strava (do ukrycia przycisku „Połącz").
const CONNECTED_KEY = 'aquamap-strava-connected';

export function isStravaConnected() {
    try {
        return localStorage.getItem(CONNECTED_KEY) === '1';
    } catch {
        return false;
    }
}

function markConnected() {
    try {
        localStorage.setItem(CONNECTED_KEY, '1');
    } catch {
        /* ignore */
    }
}

// Przekierowanie na ekran autoryzacji Strava.
export function connectStrava() {
    const redirect = window.location.origin;
    const url = 'https://www.strava.com/oauth/authorize'
        + `?client_id=${STRAVA_CLIENT_ID}`
        + `&redirect_uri=${encodeURIComponent(redirect)}`
        + '&response_type=code&approval_prompt=auto&scope=activity:read';
    window.location.href = url;
}

// Wywołanie Edge Function z tokenem zalogowanego użytkownika.
async function callFunction(name, body) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('Musisz być zalogowany.');
    }
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body || {})
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json.error) {
        throw new Error(json.error || `HTTP ${resp.status}`);
    }
    return json;
}

export function exchangeCode(code) {
    return callFunction('strava-exchange', { code });
}

export async function syncStrava() {
    const res = await callFunction('strava-sync', {});
    markConnected();
    return res;
}

export async function listActivities() {
    const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(50);
    if (error) {
        throw error;
    }
    return data;
}

// Obsługa powrotu z autoryzacji Strava (?code=...&scope=...).
// Zwraca true, jeśli wykryto i obsłużono powrót.
export async function handleStravaRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const scope = params.get('scope') || '';
    if (!code || !scope.includes('activity')) {
        return false;
    }
    // Wyczyść parametry z adresu, by ponowne wejście nie próbowało wymiany.
    window.history.replaceState({}, '', window.location.pathname);
    await exchangeCode(code);
    await syncStrava();
    return true;
}
