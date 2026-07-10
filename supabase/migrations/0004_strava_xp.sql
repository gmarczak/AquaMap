-- Faza 4 — integracje treningowe (Strava) + EXP/poziomy.

-- =====================================================================
-- 1. Tokeny integracji — dostęp WYŁĄCZNIE dla roli serwisowej (Edge Functions).
--    RLS włączone bez żadnej polityki => klient (anon/authenticated) nie ma
--    dostępu; service_role omija RLS.
-- =====================================================================
create table if not exists public.integrations (
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('strava', 'garmin')),
    access_token text not null,
    refresh_token text,
    expires_at timestamptz,
    athlete_id text,
    scope text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, provider)
);
alter table public.integrations enable row level security;

-- =====================================================================
-- 2. Zsynchronizowane treningi. Użytkownik czyta własne; zapis tylko serwis.
-- =====================================================================
create table if not exists public.activities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null,
    external_id text not null,
    sport text,
    distance_m numeric,
    duration_s integer,
    start_time timestamptz,
    pool_place_id bigint references public.places(id) on delete set null,
    raw jsonb,
    created_at timestamptz not null default now(),
    unique (provider, external_id)
);
alter table public.activities enable row level security;

drop policy if exists activities_select_own on public.activities;
create policy activities_select_own on public.activities
    for select to authenticated
    using (user_id = auth.uid());

-- =====================================================================
-- 3. Log naliczeń EXP (audyt + ochrona przed podwójnym liczeniem).
-- =====================================================================
create table if not exists public.xp_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    source text not null check (source in ('activity', 'contribution')),
    ref_id text not null,
    amount integer not null,
    created_at timestamptz not null default now(),
    unique (source, ref_id)
);
alter table public.xp_events enable row level security;

drop policy if exists xp_events_select_own on public.xp_events;
create policy xp_events_select_own on public.xp_events
    for select to authenticated
    using (user_id = auth.uid());

-- =====================================================================
-- 4. Poziom z sumy EXP: próg wejścia na poziom n = 100 * n*(n-1)/2.
--    (poziom 2: 100, poziom 3: 300, poziom 4: 600 …)
-- =====================================================================
create or replace function public.level_for_xp(total_xp integer)
returns integer
language plpgsql
immutable
as $$
declare
    lvl int := 1;
begin
    while 100 * (lvl + 1) * lvl / 2 <= coalesce(total_xp, 0) loop
        lvl := lvl + 1;
    end loop;
    return lvl;
end;
$$;

-- =====================================================================
-- 5. Naliczenie EXP za trening (wieloczynnikowo). Wywoływane przez Edge
--    Function po zapisaniu aktywności. Idempotentne (unique source,ref_id).
--    EXP = 10 (baza) + dystans/100 + 5 (seria: trening dzień wcześniej)
--          + 20 (nowy basen dla użytkownika).
-- =====================================================================
create or replace function public.award_activity_xp(
    p_user uuid,
    p_activity_id uuid,
    p_distance_m numeric,
    p_start timestamptz,
    p_pool bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    streak int := 0;
    newpool int := 0;
    amount int;
    total int;
begin
    if p_pool is not null and not exists (
        select 1 from public.activities
        where user_id = p_user and pool_place_id = p_pool and id <> p_activity_id
    ) then
        newpool := 20;
    end if;

    if exists (
        select 1 from public.activities
        where user_id = p_user and start_time::date = (p_start::date - 1)
    ) then
        streak := 5;
    end if;

    amount := 10 + floor(coalesce(p_distance_m, 0) / 100)::int + streak + newpool;

    insert into public.xp_events (user_id, source, ref_id, amount)
    values (p_user, 'activity', p_activity_id::text, amount)
    on conflict (source, ref_id) do nothing;

    select coalesce(sum(x.amount), 0) into total
    from public.xp_events x where x.user_id = p_user;

    update public.profiles set xp = total, level = public.level_for_xp(total)
    where id = p_user;

    return amount;
end;
$$;
