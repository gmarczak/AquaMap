import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)


export async function fetchPlaces() {
    const { data, error } = await supabase.from('places').select('*');

    if (error) {
        console.error('Error fetching data from Supabase:', error);
        return [];
    }
    return data;
}

export async function fetchSchedule(placeId) {
    const { data, error } = await supabase
        .from('harmonogram_torow')
        .select('*')
        .eq('place_id', placeId)
        .order('tor', { ascending: true })
        .order('godzina_od', { ascending: true });

    if (error) {
        console.error('Error fetching schedule from Supabase:', error);
        return [];
    }
    return data;
}

export async function testConnection() {
    const { data, error } = await supabase
        .from('harmonogram_torow')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Błąd połączenia z bazą:", error);
        return null;
    }

    console.log("Połączenie udane, dane:", data);
    return data;
}