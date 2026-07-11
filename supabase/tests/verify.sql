-- AquaMap — weryfikacja bazy (RLS + apply_contribution).
-- Uruchom w Supabase → SQL Editor. Skrypt jest BEZPIECZNY:
--   * część A i C są tylko-do-odczytu,
--   * część B działa w transakcji zakończonej ROLLBACK (nic nie zapisuje).

-- =====================================================================
-- A. Audyt RLS i funkcji (read-only) — sprawdź wynik wzrokowo.
-- =====================================================================

-- A1. Czy RLS jest włączone na kluczowych tabelach? (rls_enabled = true)
select c.relname as tabela, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('places','contributions','integrations','activities',
                    'xp_events','edge_rate_limits','place_photos','profiles')
order by c.relname;

-- A2. Lista polityk RLS (kto, na co). Zwróć uwagę:
--   * places: SELECT tylko status='published' lub moderator,
--   * integrations, edge_rate_limits: BRAK polityk => klient bez dostępu,
--   * contributions: insert own / select own+moderator / update moderator.
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- A3. Tabele „serwerowe" muszą mieć RLS ON i ZERO polityk (tylko service_role).
select c.relname as tabela,
       c.relrowsecurity as rls_enabled,
       count(p.policyname) as liczba_polityk
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in ('integrations','edge_rate_limits')
group by c.relname, c.relrowsecurity;

-- A4. Kluczowe funkcje istnieją i są SECURITY DEFINER (prosecdef = true).
select p.proname as funkcja, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_contribution','award_activity_xp',
                    'consume_rate_limit','is_moderator','handle_new_contribution')
order by p.proname;

-- =====================================================================
-- B. Test funkcjonalny apply_contribution (transakcja + ROLLBACK).
--    Wywołujemy funkcję wprost, sprawdzamy efekt, po czym wycofujemy.
-- =====================================================================
begin;
do $$
declare
    v_uid uuid;
    v_place_id bigint;
    v_before int;
    v_after int;
    v_slots int;
begin
    select id into v_uid from auth.users limit 1;
    if v_uid is null then
        raise exception 'Brak użytkownika w auth.users — nie mogę wykonać testu.';
    end if;

    -- B1. new_place -> nowy rekord w places
    select count(*) into v_before from public.places where nazwa = '__TEST_BASEN__';
    perform public.apply_contribution(row(
        gen_random_uuid(), 'new_place', null,
        '{"nazwa":"__TEST_BASEN__","lat":50.0,"lng":19.9,"liczba_torow":8}'::jsonb,
        'approved', v_uid, null, null, now(), null
    )::public.contributions);
    select count(*) into v_after from public.places where nazwa = '__TEST_BASEN__';
    if v_after <> v_before + 1 then
        raise exception 'B1 new_place: oczekiwano +1 basenu, jest %→%', v_before, v_after;
    end if;
    select id into v_place_id from public.places
        where nazwa = '__TEST_BASEN__' order by id desc limit 1;
    raise notice 'B1 OK: new_place -> place_id %', v_place_id;

    -- B2. edit_place -> zmiana godzin
    perform public.apply_contribution(row(
        gen_random_uuid(), 'edit_place', v_place_id,
        '{"godziny":"6-22"}'::jsonb,
        'approved', v_uid, null, null, now(), null
    )::public.contributions);
    if (select godziny from public.places where id = v_place_id) <> '6-22' then
        raise exception 'B2 edit_place: godziny nie zostały zaktualizowane';
    end if;
    raise notice 'B2 OK: edit_place';

    -- B3. schedule (replace) -> 1 slot zajęty
    perform public.apply_contribution(row(
        gen_random_uuid(), 'schedule', v_place_id,
        '{"replace":true,"entries":[{"dzien":"pon","tor":1,"od":"08:00","do":"09:00","status":"zajecia","sekcja":"","opis":"test"}]}'::jsonb,
        'approved', v_uid, null, null, now(), null
    )::public.contributions);
    select count(*) into v_slots from public.harmonogram_torow where place_id = v_place_id;
    if v_slots <> 1 then
        raise exception 'B3 schedule: oczekiwano 1 slotu, jest %', v_slots;
    end if;
    raise notice 'B3 OK: schedule';

    raise notice '=== apply_contribution: WSZYSTKIE TESTY OK (rollback poniżej) ===';
end $$;
rollback;

-- =====================================================================
-- C. (Opcjonalnie) Runtime RLS: czy zwykły użytkownik NIE widzi basenów
--    o statusie innym niż 'published'. Wynik „liczba" powinien być 0,
--    CHYBA że wylosowany użytkownik jest moderatorem (trusted/admin) —
--    wtedy widzi wszystko i wynik może być > 0 (to nie błąd).
-- =====================================================================
begin;
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from auth.users limit 1), 'role', 'authenticated')::text,
    true
);
set local role authenticated;
select 'places o statusie != published widoczne dla użytkownika' as test,
       count(*) as liczba
from public.places
where status <> 'published';
reset role;
rollback;
