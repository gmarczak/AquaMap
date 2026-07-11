-- Faza P1 — zabezpieczenia anty-nadużyciowe dla EXP.
-- Nadpisuje award_activity_xp z migracji 0004 o:
--   * minimalny dystans treningu (odcięcie „śmieciowych" wpisów),
--   * dzienny limit EXP (anty-farming), liczony wg dnia treningu (start_time).
-- Reszta logiki (baza + dystans + seria + nowy basen, idempotencja) bez zmian.

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
    min_distance_m constant numeric := 100;   -- poniżej: brak EXP
    daily_cap constant int := 200;            -- maks. EXP z treningów na dzień
    streak int := 0;
    newpool int := 0;
    amount int;
    used_today int;
    allowed int;
    total int;
begin
    -- 1. Za krótki trening: rejestrujemy zdarzenie z 0 EXP (audyt + idempotencja),
    --    ale nie nagradzamy.
    if coalesce(p_distance_m, 0) < min_distance_m then
        insert into public.xp_events (user_id, source, ref_id, amount)
        values (p_user, 'activity', p_activity_id::text, 0)
        on conflict (source, ref_id) do nothing;
        return 0;
    end if;

    -- 2. Składniki EXP (jak w 0004).
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

    -- 3. Dzienny limit: ile EXP z treningów już naliczono w dniu p_start.
    select coalesce(sum(x.amount), 0) into used_today
    from public.xp_events x
    join public.activities a on a.id::text = x.ref_id
    where x.user_id = p_user
      and x.source = 'activity'
      and a.start_time::date = p_start::date
      and a.id <> p_activity_id;

    allowed := greatest(0, daily_cap - used_today);
    amount := least(amount, allowed);

    insert into public.xp_events (user_id, source, ref_id, amount)
    values (p_user, 'activity', p_activity_id::text, amount)
    on conflict (source, ref_id) do nothing;

    -- 4. Przelicz sumę EXP i poziom.
    select coalesce(sum(x.amount), 0) into total
    from public.xp_events x where x.user_id = p_user;

    update public.profiles set xp = total, level = public.level_for_xp(total)
    where id = p_user;

    return amount;
end;
$$;
