// Edge Function AquaMap ↔ Strava (wdrażana z verify_jwt = false; użytkownika sprawdzamy sami).
//   GET  ?hub.challenge=…           — weryfikacja subskrypcji webhooka przez Stravę
//   POST {object_type, …}?key=…     — zdarzenie webhooka (nowa aktywność, odłączenie); key = STRAVA_VERIFY_TOKEN
//   POST {action:"exchange", code}  — po zgodzie w Stravie: zapis tokenów (JWT użytkownika)
//   POST {action:"sync"}            — import pływania z ostatnich 60 dni (JWT użytkownika)
//   POST {action:"subscribe"}       — jednorazowa rejestracja webhooka (tylko admin AquaMap)
// Sekrety: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_VERIFY_TOKEN (Supabase → Edge Functions → Secrets).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isManualDuplicate, matchPool, toImportRow, type StravaActivity } from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const env = (k: string) => Deno.env.get(k) ?? "";
const admin = (): SupabaseClient => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { db: { schema: "swim" } });

type Integration = { user_id: string; athlete_id: number; access_token: string; refresh_token: string; expires_at: string; last_sync_at: string | null };

async function userFrom(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

class StravaAuthError extends Error {}

async function stravaToken(body: Record<string, string>) {
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env("STRAVA_CLIENT_ID"), client_secret: env("STRAVA_CLIENT_SECRET"), ...body }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 400 || r.status === 401) throw new StravaAuthError(`strava_auth_${r.status}`);
  if (!r.ok) throw new Error(`strava_token_${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data as { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } };
}

/** Ważny token dostępu (odświeżony, gdy wygasa w ciągu minuty). */
async function accessToken(db: SupabaseClient, integ: Integration): Promise<string> {
  if (new Date(integ.expires_at).getTime() > Date.now() + 60_000) return integ.access_token;
  let t: Awaited<ReturnType<typeof stravaToken>>;
  try {
    t = await stravaToken({ grant_type: "refresh_token", refresh_token: integ.refresh_token });
  } catch (e) {
    // dostęp odwołany w Stravie: odłączamy, żeby nie próbować w kółko
    if (e instanceof StravaAuthError) await db.from("integrations").delete().eq("user_id", integ.user_id).eq("provider", "strava");
    throw e;
  }
  await db
    .from("integrations")
    .update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(t.expires_at * 1000).toISOString() })
    .eq("user_id", integ.user_id)
    .eq("provider", "strava");
  return t.access_token;
}

async function importActivities(db: SupabaseClient, integ: Integration, activities: StravaActivity[]) {
  const rows = activities.map(toImportRow).filter((r) => r !== null);
  if (rows.length === 0) return { imported: 0, skipped: 0 };
  const days = [...new Set(rows.map((r) => r.swumOn))];
  const { data: existing } = await db.from("workouts").select("swum_on, distance_m, source").eq("user_id", integ.user_id).in("swum_on", days);
  const withGps = rows.filter((r) => r.latlng);
  let pools: { id: number; lat: number; lng: number }[] = [];
  if (withGps.length > 0) {
    const lats = withGps.map((r) => r.latlng![0]);
    const lngs = withGps.map((r) => r.latlng![1]);
    const { data } = await db
      .from("pools")
      .select("id, lat, lng")
      .gte("lat", Math.min(...lats) - 0.01)
      .lte("lat", Math.max(...lats) + 0.01)
      .gte("lng", Math.min(...lngs) - 0.015)
      .lte("lng", Math.max(...lngs) + 0.015);
    pools = data ?? [];
  }
  let imported = 0;
  let skipped = 0;
  for (const row of rows.sort((a, b) => (a.swumOn < b.swumOn ? -1 : 1))) {
    if (isManualDuplicate(row, existing ?? [])) {
      skipped++;
      continue;
    }
    const { data, error } = await db.rpc("log_external_workout", {
      p_user: integ.user_id,
      p_source: "strava",
      p_external_id: row.externalId,
      p_swum_on: row.swumOn,
      p_distance_m: row.distanceM,
      p_duration_s: row.durationS,
      p_note: row.note,
    });
    if (error) throw error;
    const result = data as { workout_id: string; duplicate?: boolean };
    if (result.duplicate) continue;
    imported++;
    const poolId = matchPool(row.latlng, pools);
    if (poolId !== null) await db.from("workouts").update({ pool_id: poolId }).eq("id", result.workout_id);
  }
  return { imported, skipped };
}

async function handleWebhook(event: { object_type?: string; aspect_type?: string; object_id?: number; owner_id?: number; updates?: Record<string, string> }) {
  const db = admin();
  const { data: integ } = await db.from("integrations").select("*").eq("provider", "strava").eq("athlete_id", event.owner_id ?? -1).maybeSingle<Integration>();
  if (!integ) return;
  if (event.object_type === "athlete" && event.updates?.authorized === "false") {
    await db.from("integrations").delete().eq("user_id", integ.user_id).eq("provider", "strava");
    return;
  }
  if (event.object_type !== "activity" || event.aspect_type !== "create" || !event.object_id) return;
  const token = await accessToken(db, integ);
  const r = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return;
  await importActivities(db, integ, [(await r.json()) as StravaActivity]);
  await db.from("integrations").update({ last_sync_at: new Date().toISOString() }).eq("user_id", integ.user_id).eq("provider", "strava");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  try {
    // weryfikacja webhooka
    if (req.method === "GET") {
      const challenge = url.searchParams.get("hub.challenge");
      if (challenge && url.searchParams.get("hub.verify_token") === env("STRAVA_VERIFY_TOKEN") && env("STRAVA_VERIFY_TOKEN")) {
        return json({ "hub.challenge": challenge });
      }
      return json({ error: "forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // zdarzenie webhooka: tylko z kluczem z adresu subskrypcji; odpowiadamy od razu, import w tle
    if ("object_type" in body) {
      if (!env("STRAVA_VERIFY_TOKEN") || url.searchParams.get("key") !== env("STRAVA_VERIFY_TOKEN")) return json({ error: "forbidden" }, 403);
      const work = handleWebhook(body as Parameters<typeof handleWebhook>[0]).catch((e) => console.error("webhook", e));
      // @ts-ignore EdgeRuntime istnieje w Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
      else await work;
      return json({ ok: true });
    }

    if (!env("STRAVA_CLIENT_ID") || !env("STRAVA_CLIENT_SECRET")) return json({ error: "Strava nie jest jeszcze skonfigurowana (brak sekretów)." }, 503);
    const userId = await userFrom(req);
    if (!userId) return json({ error: "Zaloguj się ponownie." }, 401);
    const db = admin();

    if (body.action === "exchange") {
      if (typeof body.code !== "string" || !body.code) return json({ error: "Brak kodu autoryzacji." }, 400);
      const t = await stravaToken({ grant_type: "authorization_code", code: body.code });
      if (!t.athlete?.id) return json({ error: "Strava nie zwróciła konta." }, 400);
      // to samo konto Stravy podpięte gdzie indziej: przenosimy na bieżącego użytkownika
      await db.from("integrations").delete().eq("provider", "strava").eq("athlete_id", t.athlete.id).neq("user_id", userId);
      const { error } = await db.from("integrations").upsert({
        user_id: userId,
        provider: "strava",
        athlete_id: t.athlete.id,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: new Date(t.expires_at * 1000).toISOString(),
        connected_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true, athlete_id: t.athlete.id });
    }

    if (body.action === "sync") {
      const { data: integ } = await db.from("integrations").select("*").eq("user_id", userId).eq("provider", "strava").maybeSingle<Integration>();
      if (!integ) return json({ error: "Najpierw połącz Stravę." }, 400);
      if (integ.last_sync_at && Date.now() - new Date(integ.last_sync_at).getTime() < 60_000) {
        return json({ error: "Synchronizacja była przed chwilą — spróbuj za minutę." }, 429);
      }
      const token = await accessToken(db, integ);
      const after = Math.floor(Date.now() / 1000) - 60 * 24 * 3600;
      const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&after=${after}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return json({ error: r.status === 429 ? "Strava ogranicza zapytania — spróbuj za kwadrans." : `Strava odpowiedziała błędem ${r.status}.` }, 502);
      const list = await r.json();
      const result = await importActivities(db, integ, list as StravaActivity[]);
      await db.from("integrations").update({ last_sync_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", "strava");
      return json({ ok: true, ...result });
    }

    if (body.action === "subscribe") {
      const { data: isAdmin } = await db.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (!isAdmin) return json({ error: "Tylko administrator." }, 403);
      if (!env("STRAVA_VERIFY_TOKEN")) return json({ error: "Brak sekretu STRAVA_VERIFY_TOKEN." }, 503);
      const form = new FormData();
      form.set("client_id", env("STRAVA_CLIENT_ID"));
      form.set("client_secret", env("STRAVA_CLIENT_SECRET"));
      form.set("callback_url", `${env("SUPABASE_URL")}/functions/v1/aquamap-strava?key=${encodeURIComponent(env("STRAVA_VERIFY_TOKEN"))}`);
      form.set("verify_token", env("STRAVA_VERIFY_TOKEN"));
      const r = await fetch("https://www.strava.com/api/v3/push_subscriptions", { method: "POST", body: form });
      const data = await r.json().catch(() => null);
      return json({ ok: r.ok, status: r.status, data }, r.ok ? 200 : 400);
    }

    return json({ error: "Nieznana akcja." }, 400);
  } catch (e) {
    console.error(e);
    if (e instanceof StravaAuthError) return json({ error: "Strava odrzuciła dostęp — połącz konto ponownie w Ustawieniach." }, 401);
    return json({ error: "Coś poszło nie tak po stronie serwera." }, 500);
  }
});
