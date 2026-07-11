// Edge Function: wymiana kodu autoryzacyjnego Strava na tokeny i zapis ich w
// tabeli integrations pod zalogowanym użytkownikiem (identyfikacja po JWT Supabase).
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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: cors });
    }

    try {
        const authHeader = req.headers.get('Authorization') ?? '';
        const { code } = await req.json();
        if (!code) {
            return json({ error: 'Brak kodu autoryzacyjnego.' }, 400);
        }

        const url = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Ustal użytkownika z tokena Supabase.
        const userClient = createClient(url, anonKey, {
            global: { headers: { Authorization: authHeader } }
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
            return json({ error: 'Nieautoryzowany.' }, 401);
        }

        // Zapis tokenów i limit robimy rolą serwisową.
        const admin = createClient(url, serviceKey);

        // Rate-limit: maks. 10 prób połączenia na godzinę na użytkownika.
        const { data: rl } = await admin.rpc('consume_rate_limit', {
            p_user: user.id, p_action: 'strava_exchange', p_max: 10, p_window_seconds: 3600
        });
        if (rl && rl.allowed === false) {
            const mins = Math.max(1, Math.ceil((rl.retry_after ?? 60) / 60));
            return json({ error: `Za dużo prób połączenia. Spróbuj ponownie za ${mins} min.`, retry_after: rl.retry_after }, 429);
        }

        // Wymień kod na tokeny Strava (client_secret po stronie serwera).
        const resp = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: Deno.env.get('STRAVA_CLIENT_ID'),
                client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
                code,
                grant_type: 'authorization_code'
            })
        });
        const tok = await resp.json();
        if (!resp.ok) {
            return json({ error: 'Błąd wymiany tokena Strava', detail: tok }, 400);
        }

        // Zapis tokenów rolą serwisową (klient nie ma dostępu do integrations).
        const { error } = await admin.from('integrations').upsert({
            user_id: user.id,
            provider: 'strava',
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expires_at: new Date(tok.expires_at * 1000).toISOString(),
            athlete_id: String(tok.athlete?.id ?? ''),
            scope: 'activity:read',
            updated_at: new Date().toISOString()
        });
        if (error) {
            return json({ error: 'Zapis integracji nie powiódł się', detail: error.message }, 500);
        }

        return json({ ok: true, athlete_id: String(tok.athlete?.id ?? '') });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
