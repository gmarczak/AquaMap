// Edge Function: synchronizacja treningów pływackich ze Strava.
// - odświeża token, jeśli wygasł,
// - pobiera ostatnie aktywności typu Swim,
// - zapisuje je w tabeli activities (dedupe po external_id),
// - dopasowuje najbliższy basen po GPS startu (~200 m),
// - nalicza EXP (award_activity_xp).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' }
    });
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchPool(latlng: number[] | null, places: Array<{ id: number; lat: number; lng: number }>) {
    if (!latlng || latlng.length < 2) {
        return null;
    }
    let best = null;
    let bestKm = 0.2; // próg 200 m
    for (const p of places) {
        const d = distanceKm(latlng[0], latlng[1], p.lat, p.lng);
        if (d <= bestKm) {
            bestKm = d;
            best = p.id;
        }
    }
    return best;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: cors });
    }

    try {
        const authHeader = req.headers.get('Authorization') ?? '';
        const url = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const userClient = createClient(url, anonKey, {
            global: { headers: { Authorization: authHeader } }
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
            return json({ error: 'Nieautoryzowany.' }, 401);
        }

        const admin = createClient(url, serviceKey);

        // Rate-limit: maks. 6 synchronizacji na godzinę na użytkownika.
        const { data: rl } = await admin.rpc('consume_rate_limit', {
            p_user: user.id, p_action: 'strava_sync', p_max: 6, p_window_seconds: 3600
        });
        if (rl && rl.allowed === false) {
            const mins = Math.max(1, Math.ceil((rl.retry_after ?? 60) / 60));
            return json({ error: `Za dużo synchronizacji. Spróbuj ponownie za ${mins} min.`, retry_after: rl.retry_after }, 429);
        }

        const { data: integ } = await admin
            .from('integrations')
            .select('*')
            .eq('user_id', user.id)
            .eq('provider', 'strava')
            .maybeSingle();
        if (!integ) {
            return json({ error: 'Brak połączenia ze Strava.' }, 400);
        }

        // Odśwież token, jeśli wygasł.
        let accessToken = integ.access_token as string;
        if (integ.expires_at && new Date(integ.expires_at).getTime() <= Date.now() + 60000) {
            const r = await fetch('https://www.strava.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: Deno.env.get('STRAVA_CLIENT_ID'),
                    client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
                    grant_type: 'refresh_token',
                    refresh_token: integ.refresh_token
                })
            });
            const t = await r.json();
            if (!r.ok) {
                return json({ error: 'Nie udało się odświeżyć tokena', detail: t }, 400);
            }
            accessToken = t.access_token;
            await admin.from('integrations').update({
                access_token: t.access_token,
                refresh_token: t.refresh_token,
                expires_at: new Date(t.expires_at * 1000).toISOString(),
                updated_at: new Date().toISOString()
            }).eq('user_id', user.id).eq('provider', 'strava');
        }

        // Pobierz ostatnie aktywności.
        const actResp = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const activities = await actResp.json();
        if (!actResp.ok) {
            return json({ error: 'Błąd pobierania aktywności', detail: activities }, 400);
        }

        const swims = (activities as any[]).filter(a => a.type === 'Swim');

        // Baseny do dopasowania po GPS.
        const { data: places } = await admin.from('places').select('id, lat, lng');

        const MIN_SWIM_M = 100; // spójne z limitem w award_activity_xp
        let awarded = 0;
        let skipped = 0; // treningi za krótkie (bez EXP)
        for (const a of swims) {
            if (Number(a.distance ?? 0) < MIN_SWIM_M) {
                skipped++;
            }
            const pool = matchPool(a.start_latlng, places ?? []);
            const { data: up } = await admin.from('activities').upsert({
                user_id: user.id,
                provider: 'strava',
                external_id: String(a.id),
                sport: 'swimming',
                distance_m: a.distance,
                duration_s: a.moving_time,
                start_time: a.start_date,
                pool_place_id: pool,
                raw: a
            }, { onConflict: 'provider,external_id' }).select('id').single();

            if (up) {
                const { data: amount } = await admin.rpc('award_activity_xp', {
                    p_user: user.id,
                    p_activity_id: up.id,
                    p_distance_m: a.distance,
                    p_start: a.start_date,
                    p_pool: pool
                });
                awarded += Number(amount ?? 0);
            }
        }

        const { data: profile } = await admin
            .from('profiles').select('xp, level').eq('id', user.id).single();

        return json({ ok: true, swims: swims.length, awarded, skipped, dailyCap: 200, xp: profile?.xp, level: profile?.level });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
