// Edge Function: webhook Strava — push aktualizacji treningów (zamiast ręcznego sync).
// GET  — walidacja subskrypcji (hub.challenge / hub.verify_token).
// POST — zdarzenie aktywności: identyfikacja użytkownika po owner_id (athlete_id),
//        odświeżenie tokena, pobranie treningu, zapis Swim + naliczenie EXP.
// Uwaga: webhook jest publiczny (woła go Strava). Uwierzytelniamy przez verify_token
//        subskrypcji oraz przetwarzamy wyłącznie znanych sportowców (z tabeli integrations).
import { createClient } from 'jsr:@supabase/supabase-js@2';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
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

// Zwraca ważny access_token dla integracji, odświeżając go w razie potrzeby.
async function freshToken(admin: any, integ: any): Promise<string> {
    if (integ.expires_at && new Date(integ.expires_at).getTime() > Date.now() + 60000) {
        return integ.access_token;
    }
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
        throw new Error('refresh failed');
    }
    await admin.from('integrations').update({
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: new Date(t.expires_at * 1000).toISOString(),
        updated_at: new Date().toISOString()
    }).eq('user_id', integ.user_id).eq('provider', 'strava');
    return t.access_token;
}

Deno.serve(async (req) => {
    // 1. Walidacja subskrypcji (Strava wysyła GET z hub.challenge).
    if (req.method === 'GET') {
        const u = new URL(req.url);
        const mode = u.searchParams.get('hub.mode');
        const token = u.searchParams.get('hub.verify_token');
        const challenge = u.searchParams.get('hub.challenge');
        if (mode === 'subscribe' && token === Deno.env.get('STRAVA_VERIFY_TOKEN')) {
            return json({ 'hub.challenge': challenge });
        }
        return new Response('forbidden', { status: 403 });
    }

    if (req.method !== 'POST') {
        return new Response('method not allowed', { status: 405 });
    }

    // 2. Zdarzenie. Strava wymaga szybkiej odpowiedzi 200 — przetwarzamy,
    //    ale nawet przy pominięciu odsyłamy 200, by nie ponawiała.
    try {
        const event = await req.json().catch(() => null);
        if (!event || event.object_type !== 'activity'
            || !['create', 'update'].includes(event.aspect_type)) {
            return json({ ok: true, skipped: true });
        }

        const url = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const admin = createClient(url, serviceKey);

        // Identyfikuj użytkownika po athlete_id (owner_id zdarzenia).
        const { data: integ } = await admin
            .from('integrations')
            .select('*')
            .eq('provider', 'strava')
            .eq('athlete_id', String(event.owner_id))
            .maybeSingle();
        if (!integ) {
            return json({ ok: true, skipped: 'unknown athlete' });
        }

        const accessToken = await freshToken(admin, integ);

        // Pobierz szczegóły aktywności.
        const actResp = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const a = await actResp.json();
        if (!actResp.ok || a.type !== 'Swim') {
            return json({ ok: true, skipped: 'not a swim' });
        }

        const { data: places } = await admin.from('places').select('id, lat, lng');
        const pool = matchPool(a.start_latlng, places ?? []);

        const { data: up } = await admin.from('activities').upsert({
            user_id: integ.user_id,
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
            await admin.rpc('award_activity_xp', {
                p_user: integ.user_id,
                p_activity_id: up.id,
                p_distance_m: a.distance,
                p_start: a.start_date,
                p_pool: pool
            });
        }

        return json({ ok: true, processed: String(a.id) });
    } catch (e) {
        // Nawet przy błędzie 200 — inaczej Strava będzie ponawiać w kółko.
        console.error('strava-webhook:', String(e));
        return json({ ok: true, error: String(e) });
    }
});
