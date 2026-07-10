import { supabase } from './supabaseClient.js';

function czas(t) {
    return typeof t === 'string' ? t.slice(0, 5) : '';
}

export async function fetchPlaces() {
    const { data, error } = await supabase.from('places').select('*');

    if (error) {
        console.error('Error fetching data from Supabase:', error);
        throw error;
    }
    return data ?? [];
}

// Normalizujemy wiersze harmonogramu do spójnego kształtu używanego przez widok.
// W bazie zapisane są wyłącznie sloty zajęte (status 'zajecia'); reszta osi to
// czas wolny.
export async function fetchSchedule(placeId) {
    const { data, error } = await supabase
        .from('harmonogram_torow')
        .select('*')
        .eq('place_id', placeId)
        .order('tor', { ascending: true })
        .order('godzina_od', { ascending: true });

    if (error) {
        console.error('Error fetching schedule from Supabase:', error);
        throw error;
    }

    return (data ?? []).map(row => ({
        dzien: row.dzien_tygodnia,
        sekcja: row.sekcja,
        tor: row.tor,
        od: czas(row.godzina_od),
        do: czas(row.godzina_do),
        status: row.status,
        opis: row.opis
    }));
}
