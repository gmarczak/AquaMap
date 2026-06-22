const env = window.__AQUAMAP_ENV__ ?? {};

function requiredEnv(name) {
    const value = env[name];

    if (!value) {
        throw new Error(`Brak zmiennej srodowiskowej: ${name}`);
    }

    return value;
}

export const MAPBOX_ACCESS_TOKEN = requiredEnv('MAPBOX_ACCESS_TOKEN');
export const SUPABASE_URL = requiredEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = requiredEnv('SUPABASE_ANON_KEY');
