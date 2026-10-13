-- Testy zachowania schematu swim: nagrody, limity, sklep, questy, RLS, kaskady, zabezpieczenia przed farmieniem.
-- Linie z „ok_” mają zwrócić t; linie pod „oczekiwane bledy” mają się wywalić (ON_ERROR_STOP wyłączone).
-- Daty względem dzisiaj (ręczny trening może być najwyżej 14 dni wstecz).
\set ON_ERROR_STOP 0
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
select (now() at time zone 'Europe/Warsaw')::date as today \gset
select (:'today'::date - 13) as d1, (:'today'::date - 6) as d2, (:'today'::date - 5) as d3 \gset

\echo '-- poziomy'
select swim.level_for(0) = 1 and swim.level_for(199) = 1 and swim.level_for(200) = 2 and swim.level_for(599) = 2 and swim.level_for(600) = 3 and swim.level_for(10000000) = 50 as ok_levels;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select swim.bootstrap();
select count(*) = 1 as ok_settings from swim.settings;

\echo '-- pierwszy trening: 1500 m, 30 min, 4 serie → 150 + 30 + 20 = 200 EXP, 15 monet, poziom 2 + skrzynka'
select swim.log_workout('aaaaaaaa-0000-0000-0000-000000000001', :'d1', 1500, 1800, null, 25::smallint, 4::smallint, 'pierwszy',
  '[{"reps":4,"distance_m":100,"stroke":"free"}]'::jsonb) as w1 \gset
select (:'w1'::jsonb->>'xp')::int = 200 and (:'w1'::jsonb->>'coins')::int = 15 and (:'w1'::jsonb->>'level_after')::int = 2
   and exists (select 1 from jsonb_array_elements(:'w1'::jsonb->'items') i where i->>'source' = 'level') as ok_first;
select count(*) = 1 as ok_level_chest from swim.inventory where source = 'level';
select count(*) = 1 as ok_sets from swim.workout_sets where workout_id = 'aaaaaaaa-0000-0000-0000-000000000001';
\echo '-- powtórka tego samego zapisu nic nie dubluje'
select (swim.log_workout('aaaaaaaa-0000-0000-0000-000000000001', :'d1', 1500, 1800)->>'xp')::int = 200 as ok_idempotent;
select count(*) = 1 as ok_one_reward from swim.rewards where workout_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '-- tydzień później: passa 2 (+5%) i rekord tempa (+50)'
select swim.log_workout('aaaaaaaa-0000-0000-0000-000000000002', :'d2', 2000, 2300) as w2 \gset
select (:'w2'::jsonb->>'xp')::int = 300 and (:'w2'::jsonb->>'record')::boolean and (:'w2'::jsonb->>'coins')::int = 20 as ok_streak_record;

\echo '-- limit: trzeci trening tego samego dnia bez nagród'
select swim.log_workout(gen_random_uuid(), :'d3', 500, 600);
select swim.log_workout(gen_random_uuid(), :'d3', 500, 600);
select (swim.log_workout(gen_random_uuid(), :'d3', 500, 600)->>'rewarded')::boolean = false as ok_daily_limit;

\echo '-- sklep: 45 monet, czepek za 40; wydanych monet nie da się „odzyskać” usunięciem treningu'
select coalesce(sum(coins),0) = 45 as ok_coins from swim.rewards;
select swim.buy_item('czepek-silikonowy') as cap \gset
select coalesce(sum(coins),0) = 5 as ok_paid from swim.rewards;
\echo '-- oczekiwany blad (1): usunięcie treningu z wydanymi monetami'
delete from swim.workouts where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select count(*) = 1 as ok_delete_blocked from swim.workouts where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select swim.equip_item(:'cap');
select equipped as ok_equipped from swim.inventory where id = :'cap';
select id as chest from swim.inventory where source = 'level' limit 1 \gset
select swim.sell_item(:'chest') > 0 as ok_sold;

\echo '-- questy bieżącego tygodnia: dwa treningi 2600 m z 8 seriami'
select swim.log_workout(gen_random_uuid(), :'today', 2600, 3000, null, null, null, null, '[{"reps":8,"distance_m":100}]'::jsonb);
select swim.log_workout(gen_random_uuid(), :'today', 2600, 3000);
select count(*) = 3 and count(distinct kind) >= 2 as ok_three_quests from swim.week_quests();
do $$ declare q record; begin
  for q in select * from swim.week_quests() where progress >= target loop perform swim.claim_quest(q.id, q.week); end loop;
end $$;
select bool_and(claimed) and count(*) >= 1 as ok_claimed from swim.week_quests() where progress >= target;
select id as done_quest, week as done_week from swim.week_quests() where claimed limit 1 \gset
select count(*) as quest_rows from swim.rewards where kind = 'quest' \gset

\echo '-- Strava (rola serwisowa): duplikat, stare aktywności bez nagród'
reset role;
set role service_role;
select (swim.log_external_workout('11111111-1111-1111-1111-111111111111', 'strava', 'act-1', :'today'::date - 20, 1000, 1500)->>'xp')::int > 0 as ok_strava;
select (swim.log_external_workout('11111111-1111-1111-1111-111111111111', 'strava', 'act-1', :'today'::date - 20, 1000, 1500)->>'duplicate')::boolean as ok_strava_dup;
select (swim.log_external_workout('11111111-1111-1111-1111-111111111111', 'strava', 'act-old', :'today'::date - 90, 3000, 3600)->>'rewarded')::boolean = false as ok_old_no_rewards;
reset role;
set role authenticated;

\echo '-- usunięcie treningu zdejmuje jego nagrody; skrzynka za poziom zostaje i nie da się jej wyfarmić ponownie'
select coalesce(sum(xp),0) as xp_before from swim.rewards \gset
delete from swim.workouts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select coalesce(sum(xp),0) = :xp_before - 200 as ok_xp_reverted from swim.rewards;
select count(*) = 1 as ok_chest_kept from swim.inventory where id = :'chest';
select swim.log_workout('aaaaaaaa-0000-0000-0000-000000000003', :'d1', 1500, 1800);
\echo '-- notatkę i samopoczucie można zmienić'
update swim.workouts set note = 'zmienione', mood = 5 where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select note = 'zmienione' as ok_note from swim.workouts where id = 'aaaaaaaa-0000-0000-0000-000000000002';

\echo '-- oczekiwane bledy (12):'
select swim.log_workout(gen_random_uuid(), :'today', 1000, 500);                               -- za szybko (< 1:00/100 m)
select swim.log_workout(gen_random_uuid(), :'today', 12000, 14000);                            -- ponad 10 km
select swim.log_workout(gen_random_uuid(), :'today'::date + 5, 1000, 1500);                    -- przyszłość
select swim.log_workout(gen_random_uuid(), :'today'::date - 20, 1000, 1500);                   -- ponad 14 dni wstecz
select swim.buy_item('pletwy-krakena');                                                        -- za mało monet
select swim.sell_item(:'cap');                                                                 -- założony przedmiot
select swim.claim_quest(:'done_quest', :'done_week');                                          -- odebrany drugi raz
select swim.claim_quest(:'done_quest', null);                                                  -- bez tygodnia
select swim.claim_quest('dist-3k', :'today'::date - 30);                                       -- stary tydzień
update swim.workouts set distance_m = 9000 where id = 'aaaaaaaa-0000-0000-0000-000000000002';  -- dystansu nie wolno zmieniać
insert into swim.rewards(user_id, kind, xp) values ('11111111-1111-1111-1111-111111111111','quest',99999); -- księga tylko przez funkcje
insert into swim.workout_sets(workout_id, position, reps, distance_m) values ('aaaaaaaa-0000-0000-0000-000000000002', 5, 50, 100); -- serie tylko przy zapisie
select count(*) = :quest_rows as ok_no_extra_claims from swim.rewards where kind = 'quest';

\echo '-- RLS: użytkownik B'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select (select count(*) from swim.workouts) = 0 and (select count(*) from swim.rewards) = 0 and (select count(*) from swim.inventory) = 0 as ok_b_isolated;
update swim.workouts set note = 'cudze' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select count(*) = 3 as ok_b_shop_visible from swim.items where rarity = 'common';
\echo '-- oczekiwane bledy RLS (2):'
select swim.log_external_workout('22222222-2222-2222-2222-222222222222', 'strava', 'x', :'today', 1000, 1500); -- tylko rola serwisowa
select swim.equip_item(:'cap');                                                                -- cudzy przedmiot
reset role;
select note = 'zmienione' as ok_untouched from swim.workouts where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select (select count(*) from swim.inventory where source = 'level') = (select count(*) from swim.level_rewards) as ok_one_chest_per_level;

\echo '-- kasowanie konta czyści wszystko'
delete from auth.users where email = 'a@x';
select (select count(*) from swim.workouts) = 0 and (select count(*) from swim.rewards) = 0 and (select count(*) from swim.inventory) = 0 as ok_cascade;
