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
