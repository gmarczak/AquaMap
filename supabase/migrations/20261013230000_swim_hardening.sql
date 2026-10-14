-- Utwardzenie gry po przeglądzie kodu:
--  * claim_quest z p_week = null nie może odbierać nagrody w nieskończoność (+ constraint na księdze)
--  * skrzynka za poziom tylko raz na poziom (swim.level_rewards), niezależnie od usuwania treningów
--  * blokada per użytkownik (advisory lock) — równoległe zapisy nie obchodzą limitu 2 treningów dziennie
--  * ręczny trening najwyżej 14 dni wstecz; nagrody tylko za treningi z ostatnich 60 dni (także ze Stravy)
--  * serie tylko przy zapisie treningu (nie da się dopisać serii pod quest)
--  * nie można usunąć treningu, jeśli jego monety zostały już wydane (saldo spadłoby poniżej zera)
--  * rekord tempa liczony tylko z nagrodzonych treningów
--  * równoległy import tej samej aktywności ze Stravy czeka na blokadę zamiast wywracać synchronizację

alter table swim.rewards add constraint rewards_quest_week check (kind <> 'quest' or (quest_id is not null and week is not null));

create table swim.level_rewards (
  user_id     uuid not null references auth.users (id) on delete cascade,
  level       smallint not null check (level between 2 and 50),
  granted_at  timestamptz not null default now(),
  primary key (user_id, level)
);
alter table swim.level_rewards enable row level security;
grant all on swim.level_rewards to service_role;

-- Serie zapisuje tylko log_workout (polityka own_sets zostaje, ale bez uprawnień do zapisu nic nie daje).
revoke insert, update, delete on swim.workout_sets from authenticated;

-- Jedna operacja gry naraz na użytkownika.
create function swim.lock_user(p_user uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('swim:' || p_user::text, 0))
$$;

-- Skrzynki za nowe poziomy — każdy poziom najwyżej raz w historii konta.
create function swim.grant_level_chests(p_user uuid, p_before integer, p_after integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_lvl integer := p_before + 1;
  v_inv uuid;
  v_items jsonb := '[]'::jsonb;
begin
  while v_lvl <= p_after loop
    insert into swim.level_rewards (user_id, level) values (p_user, v_lvl) on conflict do nothing;
    if found then
      v_inv := swim.grant_item(p_user, swim.roll_item(array[greatest(60 - 2 * v_lvl, 20), 28, 10 + v_lvl, 2 + v_lvl / 2.0]), 'level', null);
      if v_inv is not null then
        v_items := v_items || jsonb_build_object('id', v_inv, 'item_id', (select item_id from swim.inventory where id = v_inv), 'source', 'level');
      end if;
    end if;
    v_lvl := v_lvl + 1;
  end loop;
  return v_items;
end $$;

create or replace function swim.award_workout(p_user uuid, p_workout uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  w swim.workouts;
  v_level_before integer;
  v_dist integer;
  v_min integer;
  v_sets integer;
  v_streak integer;
  v_streak_pct integer;
  v_eq_xp integer;
  v_eq_coins integer;
  v_xp integer;
  v_coins integer;
  v_best numeric;
  v_chests jsonb;
  v_summary jsonb;
begin
  perform swim.lock_user(p_user);
  select * into w from swim.workouts where id = p_workout and user_id = p_user;
  if not found then raise exception 'workout_not_found' using errcode = 'P0002'; end if;
  v_level_before := swim.level_for((select t.xp from swim.totals(p_user) t));
  if exists (select 1 from swim.rewards r where r.workout_id = p_workout) then
    return swim.workout_summary(p_user, p_workout, v_level_before);
  end if;

  -- bez nagród: zbyt szybkie tempo, trening sprzed ponad 60 dni, trzeci i kolejny trening dnia
  if w.duration_s < w.distance_m * 0.6
     or w.swum_on < swim.user_today(p_user) - 60
     or (select count(*) from swim.rewards r join swim.workouts o on o.id = r.workout_id
         where r.user_id = p_user and r.kind = 'workout' and r.xp > 0 and o.swum_on = w.swum_on and o.id <> w.id) >= 2 then
    insert into swim.rewards (user_id, kind, xp, coins, workout_id) values (p_user, 'workout', 0, 0, w.id);
    return swim.workout_summary(p_user, p_workout, v_level_before);
  end if;

  v_dist := least(w.distance_m, 10000);
  v_min := least(w.duration_s / 60, 240);
  v_sets := least(coalesce((select sum(s.reps) from swim.workout_sets s where s.workout_id = w.id), 0), 20);

  with weeks as (
    select distinct date_trunc('week', o.swum_on)::date as wk from swim.workouts o
    where o.user_id = p_user and o.swum_on <= w.swum_on
  ), numbered as (select wk, row_number() over (order by wk desc) as rn from weeks)
  select count(*) into v_streak from numbered where wk = date_trunc('week', w.swum_on)::date - ((rn - 1) * 7)::integer;
  v_streak_pct := least(5 * greatest(v_streak - 1, 0), 25);

  select least(coalesce(sum(i.bonus_pct) filter (where i.bonus_kind = 'xp'), 0), 30),
         least(coalesce(sum(i.bonus_pct) filter (where i.bonus_kind = 'coins'), 0), 30)
    into v_eq_xp, v_eq_coins
    from swim.inventory v join swim.items i on i.id = v.item_id
   where v.user_id = p_user and v.equipped;

  v_xp := round((v_dist / 10.0 + v_min + 5 * v_sets) * (1 + (v_streak_pct + v_eq_xp) / 100.0));
  v_coins := floor(v_dist / 100.0 * (1 + v_eq_coins / 100.0));
  insert into swim.rewards (user_id, kind, xp, coins, workout_id) values (p_user, 'workout', v_xp, v_coins, w.id);

  if w.distance_m >= 400 then
    select min(o.duration_s::numeric / o.distance_m) into v_best
      from swim.workouts o join swim.rewards r on r.workout_id = o.id and r.kind = 'workout' and r.xp > 0
     where o.user_id = p_user and o.id <> w.id and o.distance_m >= 400;
    if v_best is not null and w.duration_s::numeric / w.distance_m < v_best then
      insert into swim.rewards (user_id, kind, xp, coins, workout_id) values (p_user, 'record', 50, 0, w.id);
    end if;
  end if;

  if random() < least(0.10 + v_dist / 1000.0 * 0.08, 0.60) then
    perform swim.grant_item(p_user, swim.roll_item(array[60, 28, 10, 2]), 'loot', w.id);
  end if;

  v_chests := swim.grant_level_chests(p_user, v_level_before, swim.level_for((select t.xp from swim.totals(p_user) t)));
  v_summary := swim.workout_summary(p_user, p_workout, v_level_before);
  return jsonb_set(v_summary, '{items}', (v_summary -> 'items') || v_chests);
end $$;

create or replace function swim.log_workout(
  p_id uuid, p_swum_on date, p_distance_m integer, p_duration_s integer,
  p_pool_id bigint default null, p_pool_length_m smallint default null,
  p_mood smallint default null, p_note text default null, p_sets jsonb default '[]'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_today date;
  v_set jsonb;
  v_pos integer := 0;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform swim.lock_user(v_user);
  select user_id into v_owner from swim.workouts where id = p_id;
  if found then
    if v_owner <> v_user then raise exception 'workout_not_found' using errcode = 'P0002'; end if;
    return swim.award_workout(v_user, p_id);
  end if;
  v_today := swim.user_today(v_user);
  if p_duration_s < p_distance_m * 0.6 then raise exception 'too_fast' using errcode = '22023'; end if;
  if p_distance_m > 10000 or p_duration_s > 14400 then raise exception 'too_long' using errcode = '22023'; end if;
  if p_swum_on > v_today + 1 then raise exception 'future_date' using errcode = '22023'; end if;
  if p_swum_on < v_today - 14 then raise exception 'too_old' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_sets, '[]'::jsonb)) > 40 then raise exception 'too_many_sets' using errcode = '22023'; end if;

  insert into swim.workouts (id, user_id, swum_on, distance_m, duration_s, pool_id, pool_length_m, mood, note, source)
  values (p_id, v_user, p_swum_on, p_distance_m, p_duration_s, p_pool_id, p_pool_length_m, p_mood, nullif(btrim(p_note), ''), 'manual');

  for v_set in select * from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) loop
    insert into swim.workout_sets (workout_id, user_id, position, reps, distance_m, stroke, rest_s)
    values (p_id, v_user, v_pos, (v_set ->> 'reps')::smallint, (v_set ->> 'distance_m')::smallint,
            coalesce((v_set ->> 'stroke')::swim.stroke, 'free'), (v_set ->> 'rest_s')::smallint);
    v_pos := v_pos + 1;
  end loop;

  return swim.award_workout(v_user, p_id);
end $$;

create or replace function swim.log_external_workout(
  p_user uuid, p_source swim.source, p_external_id text, p_swum_on date,
  p_distance_m integer, p_duration_s integer, p_pool_length_m smallint default null, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform swim.lock_user(p_user);
  select id into v_id from swim.workouts where user_id = p_user and source = p_source and external_id = p_external_id;
  if found then return jsonb_build_object('workout_id', v_id, 'duplicate', true); end if;
  insert into swim.workouts (user_id, swum_on, distance_m, duration_s, pool_length_m, note, source, external_id)
  values (p_user, p_swum_on, least(greatest(p_distance_m, 25), 20000), least(greatest(p_duration_s, 60), 21600),
          p_pool_length_m, nullif(left(btrim(p_note), 1000), ''), p_source, p_external_id)
  returning id into v_id;
  return swim.award_workout(p_user, v_id);
end $$;

create or replace function swim.claim_quest(p_quest text, p_week date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_week date;
  v_this date;
  q record;
  v_before integer;
  v_after integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_quest is null or p_week is null then raise exception 'quest_not_found' using errcode = 'P0002'; end if;
  perform swim.lock_user(v_user);
  v_week := date_trunc('week', p_week)::date;
  v_this := date_trunc('week', swim.user_today(v_user))::date;
  if v_week not in (v_this, v_this - 7) then raise exception 'quest_expired' using errcode = '22023'; end if;
  select * into q from swim.week_quests(v_week) w where w.id = p_quest;
  if not found then raise exception 'quest_not_found' using errcode = 'P0002'; end if;
  if q.claimed then raise exception 'quest_claimed' using errcode = '22023'; end if;
  if q.progress < q.target then raise exception 'quest_not_done' using errcode = '22023'; end if;
  v_before := swim.level_for((select t.xp from swim.totals(v_user) t));
  insert into swim.rewards (user_id, kind, xp, coins, quest_id, week) values (v_user, 'quest', q.reward_xp, q.reward_coins, p_quest, v_week);
  v_after := swim.level_for((select t.xp from swim.totals(v_user) t));
  return jsonb_build_object('xp', q.reward_xp, 'coins', q.reward_coins, 'level_before', v_before, 'level_after', v_after,
                            'items', swim.grant_level_chests(v_user, v_before, v_after));
end $$;

create or replace function swim.buy_item(p_item text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_inv uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform swim.lock_user(v_user);
  select price into v_price from swim.items where id = p_item and in_shop;
  if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  if (select t.coins from swim.totals(v_user) t) < v_price then raise exception 'not_enough_coins' using errcode = '22023'; end if;
  v_inv := swim.grant_item(v_user, p_item, 'shop', null);
  insert into swim.rewards (user_id, kind, coins, inventory_id) values (v_user, 'purchase', -v_price, v_inv);
  return v_inv;
end $$;

-- Usunięcie treningu przez użytkownika: blokada, gdy jego monety (z treningu i ze sprzedaży jego łupu)
-- zostały już wydane. Kasowanie konta i operacje serwisowe nie są blokowane.
create function swim.guard_workout_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_after bigint;
begin
  if (select auth.uid()) is distinct from old.user_id then return old; end if;
  perform swim.lock_user(old.user_id);
  select (select coalesce(sum(r.coins), 0) from swim.rewards r where r.user_id = old.user_id)
       - (select coalesce(sum(r.coins), 0) from swim.rewards r
           where r.workout_id = old.id or r.inventory_id in (select v.id from swim.inventory v where v.workout_id = old.id))
    into v_after;
  if v_after < 0 then raise exception 'coins_spent' using errcode = '22023'; end if;
  return old;
end $$;

create trigger workouts_guard_delete before delete on swim.workouts
  for each row execute function swim.guard_workout_delete();

revoke execute on function swim.lock_user(uuid), swim.grant_level_chests(uuid, integer, integer), swim.guard_workout_delete() from public, anon, authenticated;
grant execute on function swim.lock_user(uuid), swim.grant_level_chests(uuid, integer, integer) to service_role;
