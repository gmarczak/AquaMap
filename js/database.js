import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Adapter: tabele w bazie to PoolLocations / PoolLaneSchedules.
// Normalizujemy je tutaj do jednego, spójnego kształtu, którego używa reszta
// aplikacji (mapa, lista, widok szczegółów), żeby nie rozsmarowywać nazw
// kolumn z bazy po całym froncie.

function normalizePlace(row) {
    return {
        id: row.id,
        nazwa: row.name,
        lat: row.latitude,
        lng: row.longitude,
        godziny: row.opening_hours,
        dlugosc: row.length_meters,
        trudnosc: row.difficulty,
        udogodnienia: Array.isArray(row.amenities) ? row.amenities : []
    };
}

// lane_label ma postać "Duża niecka - Tor 1" albo "Mała niecka - grzybek".
// Rozbijamy na sekcję (niecka) i etykietę toru.
function parseLane(label) {
    const parts = String(label ?? '').split(' - ');
    if (parts.length >= 2) {
        return { sekcja: parts[0].trim(), tor: parts.slice(1).join(' - ').trim() };
    }
    return { sekcja: null, tor: String(label ?? '').trim() };
}

function czas(t) {
    return typeof t === 'string' ? t.slice(0, 5) : '';
}

// W bazie zapisane są wyłącznie sloty zajęte. Wszystko poza nimi to czas wolny.
function normalizeSlot(row) {
    const { sekcja, tor } = parseLane(row.lane_label);
    return {
        dzien: row.day_of_week,
        sekcja,
        tor,
        od: czas(row.start_time),
        do: czas(row.end_time),
        opis: row.occupant_label ?? 'Zajęte'
    };
}

export async function fetchPlaces() {
    const { data, error } = await supabase.from('PoolLocations').select('*');

    if (error) {
        console.error('Error fetching data from Supabase:', error);
        throw error;
    }
    return (data ?? []).map(normalizePlace);
}

export async function fetchSchedule(placeId) {
    const { data, error } = await supabase
        .from('PoolLaneSchedules')
        .select('*')
        .eq('pool_id', placeId)
        .order('lane_label', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) {
        console.error('Error fetching schedule from Supabase:', error);
        return [];
    }
    return (data ?? []).map(normalizeSlot);
}
