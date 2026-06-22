function requiredEnv(name, value) {
    if (!value) {
        throw new Error(`Brak zmiennej srodowiskowej: ${name}`);
    }

    return value;
}

export const MAPBOX_ACCESS_TOKEN = requiredEnv('VITE_MAPBOX_ACCESS_TOKEN', import.meta.env.VITE_MAPBOX_ACCESS_TOKEN);
export const SUPABASE_URL = requiredEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = requiredEnv('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY);
