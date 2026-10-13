-- AquaMap (rebuild): mapa basenów + dziennik pływania + gra (EXP, poziomy, passa, loot, sklep, questy).
-- Schemat `swim` w tej samej bazie i na tym samym koncie co Nawyki, Finanse i Garaż.
-- Zasada: klient zapisuje trening i swoje ustawienia; EXP, monety i przedmioty przyznają WYŁĄCZNIE
-- funkcje w tym pliku (security definer), więc nie da się ich dopisać z przeglądarki.
-- Stan gracza nie jest przechowywany osobno: EXP i monety to suma księgi `rewards`,
-- a usunięcie treningu kaskadowo zdejmuje jego nagrody (także przedmioty i ich sprzedaż).

create schema if not exists swim;

create type swim.source as enum ('manual', 'strava', 'garmin');
create type swim.stroke as enum ('free', 'back', 'breast', 'fly', 'im', 'kick', 'pull', 'mixed');
create type swim.rarity as enum ('common', 'rare', 'epic', 'legendary');
create type swim.slot as enum ('goggles', 'cap', 'fins', 'suit', 'paddles', 'buoy');

-- ============ BASENY (wspólne) ============
create table swim.pools (
  id             bigint generated always as identity primary key,
  osm_id         text unique,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  city           text check (char_length(city) <= 80),
  street         text check (char_length(street) <= 120),
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  kind           text not null default 'pool' check (kind in ('pool', 'sports_centre', 'water_park')),
  website        text check (char_length(website) <= 300),
  phone          text check (char_length(phone) <= 60),
  opening_hours  text check (char_length(opening_hours) <= 500),
  length_m       smallint check (length_m between 10 and 100),
  lanes          smallint check (lanes between 1 and 20),
  hidden         boolean not null default false,
  updated_at     timestamptz not null default now()
);
create index pools_geo_idx on swim.pools (lat, lng) where not hidden;

create table swim.lane_schedules (
  id          bigint generated always as identity primary key,
  pool_id     bigint not null references swim.pools (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  starts      time not null,
  ends        time not null,
  lane        smallint check (lane between 1 and 20),
  label       text check (char_length(label) <= 60),
  check (ends > starts)
);
create index lane_schedules_pool_idx on swim.lane_schedules (pool_id, weekday);

create table swim.admins (user_id uuid primary key references auth.users (id) on delete cascade);

-- ============ GRACZ ============
create table swim.settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone         text not null default 'Europe/Warsaw',
  default_pool_id  bigint references swim.pools (id) on delete set null,
  default_length_m smallint not null default 25 check (default_length_m between 10 and 100),
  created_at       timestamptz not null default now()
);

create table swim.workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  swum_on        date not null,
  distance_m     integer not null check (distance_m between 25 and 20000),
  duration_s     integer not null check (duration_s between 60 and 21600),
  pool_id        bigint references swim.pools (id) on delete set null,
  pool_length_m  smallint check (pool_length_m between 10 and 100),
  mood           smallint check (mood between 1 and 5),
  note           text check (char_length(note) <= 1000),
  source         swim.source not null default 'manual',
  external_id    text check (char_length(external_id) <= 64),
  created_at     timestamptz not null default now(),
  unique (id, user_id),
  unique (source, external_id)
);
create index workouts_user_day_idx on swim.workouts (user_id, swum_on desc);

create table swim.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position    smallint not null check (position between 0 and 99),
  reps        smallint not null check (reps between 1 and 50),
  distance_m  smallint not null check (distance_m between 25 and 2000),
  stroke      swim.stroke not null default 'free',
  rest_s      smallint check (rest_s between 0 and 600),
  foreign key (workout_id, user_id) references swim.workouts (id, user_id) on delete cascade
);
create index workout_sets_workout_idx on swim.workout_sets (workout_id);

-- ============ PRZEDMIOTY ============
create table swim.items (
  id           text primary key,
  name         text not null,
  slot         swim.slot not null,
  rarity       swim.rarity not null,
  bonus_kind   text not null check (bonus_kind in ('xp', 'coins')),
  bonus_pct    smallint not null check (bonus_pct between 0 and 50),
  price        integer not null check (price > 0),
  description  text not null default '',
  in_shop      boolean not null default true,
  sort         smallint not null default 0
);

create table swim.inventory (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  item_id      text not null references swim.items (id),
  slot         swim.slot not null,
  source       text not null check (source in ('loot', 'level', 'shop', 'quest')),
  workout_id   uuid,
  equipped     boolean not null default false,
  sold_at      timestamptz,
  acquired_at  timestamptz not null default now(),
  foreign key (workout_id, user_id) references swim.workouts (id, user_id) on delete cascade,
  check (not (equipped and sold_at is not null))
);
create index inventory_user_idx on swim.inventory (user_id);
create unique index inventory_one_per_slot on swim.inventory (user_id, slot) where equipped;

-- ============ KSIĘGA NAGRÓD ============
create table swim.rewards (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('workout', 'record', 'quest', 'purchase', 'sale')),
  xp            integer not null default 0,
  coins         integer not null default 0,
  workout_id    uuid,
  inventory_id  uuid references swim.inventory (id) on delete cascade,
  quest_id      text,
  week          date,
  created_at    timestamptz not null default now(),
  foreign key (workout_id, user_id) references swim.workouts (id, user_id) on delete cascade,
  unique (user_id, quest_id, week)
);
create index rewards_user_idx on swim.rewards (user_id);
create index rewards_workout_idx on swim.rewards (workout_id);

-- ============ QUESTY ============
-- Co tydzień 3 questy: po jednym z każdej grupy, wybrane deterministycznie z (użytkownik, tydzień).
create table swim.quests (
  id            text primary key,
  grp           smallint not null check (grp between 1 and 3),
  title         text not null,
  kind          text not null check (kind in ('distance', 'sessions', 'long', 'sets')),
  target        integer not null check (target > 0),
  reward_xp     integer not null check (reward_xp >= 0),
  reward_coins  integer not null check (reward_coins >= 0)
);

-- ============ INTEGRACJE (tokeny tylko dla Edge Functions) ============
create table swim.integrations (
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       text not null check (provider in ('strava')),
  athlete_id     bigint not null,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  connected_at   timestamptz not null default now(),
  last_sync_at   timestamptz,
  primary key (user_id, provider),
  unique (provider, athlete_id)
);

-- ============ RLS ============
alter table swim.pools          enable row level security;
alter table swim.lane_schedules enable row level security;
alter table swim.admins         enable row level security;
alter table swim.settings       enable row level security;
alter table swim.workouts       enable row level security;
alter table swim.workout_sets   enable row level security;
alter table swim.items          enable row level security;
alter table swim.inventory      enable row level security;
alter table swim.rewards        enable row level security;
alter table swim.quests         enable row level security;
alter table swim.integrations   enable row level security;

create function swim.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from swim.admins where user_id = (select auth.uid()))
$$;

create policy read_pools on swim.pools for select to authenticated using (not hidden or swim.is_admin());
create policy admin_pools on swim.pools for all to authenticated using (swim.is_admin()) with check (swim.is_admin());
create policy read_schedules on swim.lane_schedules for select to authenticated using (true);
create policy admin_schedules on swim.lane_schedules for all to authenticated using (swim.is_admin()) with check (swim.is_admin());
create policy read_items on swim.items for select to authenticated using (true);
create policy read_quests on swim.quests for select to authenticated using (true);

create policy own_settings on swim.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_workouts_read on swim.workouts for select to authenticated using (user_id = (select auth.uid()));
create policy own_workouts_update on swim.workouts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_workouts_delete on swim.workouts for delete to authenticated using (user_id = (select auth.uid()));
create policy own_sets on swim.workout_sets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_inventory on swim.inventory for select to authenticated using (user_id = (select auth.uid()));
create policy own_rewards on swim.rewards for select to authenticated using (user_id = (select auth.uid()));
-- admins, integrations: brak polityk dla klienta (tylko funkcje i rola serwisowa)

-- ============ LOGIKA GRY ============
-- EXP potrzebne do kolejnego poziomu: 200 × poziom; max poziom 50. Zwraca poziom dla łącznego EXP.
create function swim.level_for(p_total_xp bigint) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_level integer := 1;
  v_left bigint := greatest(p_total_xp, 0);
begin
  while v_level < 50 and v_left >= 200 * v_level loop
    v_left := v_left - 200 * v_level;
    v_level := v_level + 1;
  end loop;
  return v_level;
end $$;

create function swim.totals(p_user uuid, out xp bigint, out coins bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.xp), 0), coalesce(sum(r.coins), 0) from swim.rewards r where r.user_id = p_user
$$;

-- Losuje przedmiot: rzadkość wg wag (common, rare, epic, legendary), potem przedmiot tej rzadkości.
create function swim.roll_item(p_weights numeric[]) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_total numeric := p_weights[1] + p_weights[2] + p_weights[3] + p_weights[4];
  v_roll numeric := random() * v_total;
  v_rarity swim.rarity;
begin
  v_rarity := case
    when v_roll < p_weights[1] then 'common'
    when v_roll < p_weights[1] + p_weights[2] then 'rare'
    when v_roll < p_weights[1] + p_weights[2] + p_weights[3] then 'epic'
    else 'legendary' end;
  return (select i.id from swim.items i where i.rarity = v_rarity order by random() limit 1);
end $$;

create function swim.grant_item(p_user uuid, p_item text, p_source text, p_workout uuid) returns uuid
language sql volatile security definer set search_path = '' as $$
  insert into swim.inventory (user_id, item_id, slot, source, workout_id)
  select p_user, i.id, i.slot, p_source, p_workout from swim.items i where i.id = p_item
  returning id
$$;

-- Podsumowanie nagród treningu z księgi (także przy powtórce tego samego zapisu).
create function swim.workout_summary(p_user uuid, p_workout uuid, p_level_before integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'workout_id', p_workout,
    'xp', coalesce((select sum(r.xp) from swim.rewards r where r.workout_id = p_workout), 0),
    'coins', coalesce((select sum(r.coins) from swim.rewards r where r.workout_id = p_workout and r.kind in ('workout', 'record')), 0),
    'record', exists (select 1 from swim.rewards r where r.workout_id = p_workout and r.kind = 'record'),
    'rewarded', exists (select 1 from swim.rewards r where r.workout_id = p_workout and r.kind = 'workout' and r.xp > 0),
    'level_before', p_level_before,
    'level_after', swim.level_for((select t.xp from swim.totals(p_user) t)),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'item_id', v.item_id, 'source', v.source) order by v.acquired_at)
                       from swim.inventory v where v.workout_id = p_workout), '[]'::jsonb)
  )
$$;

-- Nagrody za zapisany trening. Zasady (propozycja v1, do strojenia):
--   EXP = min(dystans, 10 km)/10 + min(minuty, 240) + 5 × serie (max 20), × (1 + passa% + ekwipunek%)
--   passa: kolejne tygodnie ISO z treningiem; +5% za każdy po pierwszym, max +25%
--   monety = min(dystans, 10 km)/100 × (1 + ekwipunek%); ekwipunek: max +30% EXP i max +30% monet
--   rekord tempa (trening ≥ 400 m szybszy niż każdy wcześniejszy ≥ 400 m): +50 EXP
--   nagrody tylko za 2 pierwsze treningi dnia i tylko przy tempie nie szybszym niż 1:00/100 m
--   loot: szansa 10% + 8% na każdy km (max 60%); każdy nowy poziom = gwarantowana skrzynka
create function swim.award_workout(p_user uuid, p_workout uuid) returns jsonb
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
  v_level_after integer;
  v_lvl integer;
begin
  select * into w from swim.workouts where id = p_workout and user_id = p_user;
  if not found then raise exception 'workout_not_found' using errcode = 'P0002'; end if;
  v_level_before := swim.level_for((select t.xp from swim.totals(p_user) t));
  if exists (select 1 from swim.rewards r where r.workout_id = p_workout) then
    return swim.workout_summary(p_user, p_workout, v_level_before);
  end if;

  -- limity: tempo i 2 nagradzane treningi dziennie
  if w.duration_s < w.distance_m * 0.6
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
    select min(o.duration_s::numeric / o.distance_m) into v_best from swim.workouts o
     where o.user_id = p_user and o.id <> w.id and o.distance_m >= 400;
    if v_best is not null and w.duration_s::numeric / w.distance_m < v_best then
      insert into swim.rewards (user_id, kind, xp, coins, workout_id) values (p_user, 'record', 50, 0, w.id);
    end if;
  end if;

  if random() < least(0.10 + v_dist / 1000.0 * 0.08, 0.60) then
    perform swim.grant_item(p_user, swim.roll_item(array[60, 28, 10, 2]), 'loot', w.id);
  end if;

  v_level_after := swim.level_for((select t.xp from swim.totals(p_user) t));
  v_lvl := v_level_before + 1;
  while v_lvl <= v_level_after loop
    perform swim.grant_item(p_user, swim.roll_item(array[greatest(60 - 2 * v_lvl, 20), 28, 10 + v_lvl, 2 + v_lvl / 2.0]), 'level', w.id);
    v_lvl := v_lvl + 1;
  end loop;

  return swim.workout_summary(p_user, p_workout, v_level_before);
end $$;

-- Zapis treningu z aplikacji (id nadaje klient: powtórka po utracie sieci niczego nie dubluje).
create function swim.log_workout(
  p_id uuid, p_swum_on date, p_distance_m integer, p_duration_s integer,
  p_pool_id bigint default null, p_pool_length_m smallint default null,
  p_mood smallint default null, p_note text default null, p_sets jsonb default '[]'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_set jsonb;
  v_pos integer := 0;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select user_id into v_owner from swim.workouts where id = p_id;
  if found then
    if v_owner <> v_user then raise exception 'workout_not_found' using errcode = 'P0002'; end if;
    return swim.award_workout(v_user, p_id);
  end if;
  if p_duration_s < p_distance_m * 0.6 then raise exception 'too_fast' using errcode = '22023'; end if;
  if p_distance_m > 10000 or p_duration_s > 14400 then raise exception 'too_long' using errcode = '22023'; end if;
  if p_swum_on > (now() at time zone coalesce((select s.timezone from swim.settings s where s.user_id = v_user), 'Europe/Warsaw'))::date + 1 then
    raise exception 'future_date' using errcode = '22023';
  end if;
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

-- Trening z zewnątrz (Strava/Garmin) — wywołuje tylko Edge Function z rolą serwisową.
create function swim.log_external_workout(
  p_user uuid, p_source swim.source, p_external_id text, p_swum_on date,
  p_distance_m integer, p_duration_s integer, p_pool_length_m smallint default null, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from swim.workouts where source = p_source and external_id = p_external_id;
  if found then return jsonb_build_object('workout_id', v_id, 'duplicate', true); end if;
  insert into swim.workouts (user_id, swum_on, distance_m, duration_s, pool_length_m, note, source, external_id)
  values (p_user, p_swum_on, least(greatest(p_distance_m, 25), 20000), least(greatest(p_duration_s, 60), 21600),
          p_pool_length_m, nullif(left(btrim(p_note), 1000), ''), p_source, p_external_id)
  returning id into v_id;
  return swim.award_workout(p_user, v_id);
end $$;

-- ============ SKLEP I EKWIPUNEK ============
create function swim.sell_value(p_rarity swim.rarity) returns integer
language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 10 when 'rare' then 50 when 'epic' then 200 else 1000 end
$$;

create function swim.buy_item(p_item text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_inv uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select price into v_price from swim.items where id = p_item and in_shop;
  if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if (select t.coins from swim.totals(v_user) t) < v_price then raise exception 'not_enough_coins' using errcode = '22023'; end if;
  v_inv := swim.grant_item(v_user, p_item, 'shop', null);
  insert into swim.rewards (user_id, kind, coins, inventory_id) values (v_user, 'purchase', -v_price, v_inv);
  return v_inv;
end $$;

create function swim.sell_item(p_inventory uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_value integer;
begin
  select swim.sell_value(i.rarity) into v_value from swim.inventory v join swim.items i on i.id = v.item_id
   where v.id = p_inventory and v.user_id = v_user and v.sold_at is null and not v.equipped
   for update of v;
  if not found then raise exception 'item_not_sellable' using errcode = '22023'; end if;
  update swim.inventory set sold_at = now() where id = p_inventory;
  insert into swim.rewards (user_id, kind, coins, inventory_id) values (v_user, 'sale', v_value, p_inventory);
  return v_value;
end $$;

create function swim.equip_item(p_inventory uuid, p_equip boolean default true) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_slot swim.slot;
begin
  select slot into v_slot from swim.inventory where id = p_inventory and user_id = v_user and sold_at is null;
  if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  if p_equip then
    update swim.inventory set equipped = false where user_id = v_user and slot = v_slot and equipped and id <> p_inventory;
  end if;
  update swim.inventory set equipped = p_equip where id = p_inventory;
end $$;

-- ============ QUESTY ============
create function swim.user_today(p_user uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select s.timezone from swim.settings s where s.user_id = p_user), 'Europe/Warsaw'))::date
$$;

-- Questy tygodnia (poniedziałek p_week) z postępem.
create function swim.week_quests(p_week date default null)
returns table (id text, title text, kind text, target integer, progress integer, reward_xp integer, reward_coins integer, claimed boolean, week date)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid),
  wk as (select coalesce(date_trunc('week', p_week)::date, date_trunc('week', swim.user_today((select uid from me)))::date) as d),
  pick as (
    select distinct on (q.grp) q.* from swim.quests q
    order by q.grp, md5((select uid from me)::text || (select d from wk)::text || q.id)
  ),
  ws as (
    select o.id, o.distance_m, coalesce((select sum(s.reps) from swim.workout_sets s where s.workout_id = o.id), 0) as reps
    from swim.workouts o where o.user_id = (select uid from me)
      and o.swum_on between (select d from wk) and (select d from wk) + 6
  )
  select p.id, p.title, p.kind, p.target,
    (case p.kind
      when 'distance' then coalesce((select sum(distance_m) from ws), 0)
      when 'sessions' then (select count(*) from ws)
      when 'long' then coalesce((select max(distance_m) from ws), 0)
      else coalesce((select max(reps) from ws), 0) end)::integer,
    p.reward_xp, p.reward_coins,
    exists (select 1 from swim.rewards r where r.user_id = (select uid from me) and r.quest_id = p.id and r.week = (select d from wk)),
    (select d from wk)
  from pick p
  where (select uid from me) is not null
  order by p.grp
$$;

-- Odbiór nagrody za quest (bieżący albo poprzedni tydzień). Nowy poziom = skrzynka.
create function swim.claim_quest(p_quest text, p_week date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', p_week)::date;
  v_this date;
  q record;
  v_before integer;
  v_after integer;
  v_lvl integer;
  v_items jsonb := '[]'::jsonb;
  v_inv uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_this := date_trunc('week', swim.user_today(v_user))::date;
  if v_week not in (v_this, v_this - 7) then raise exception 'quest_expired' using errcode = '22023'; end if;
  select * into q from swim.week_quests(v_week) w where w.id = p_quest;
  if not found then raise exception 'quest_not_found' using errcode = 'P0002'; end if;
  if q.claimed then raise exception 'quest_claimed' using errcode = '22023'; end if;
  if q.progress < q.target then raise exception 'quest_not_done' using errcode = '22023'; end if;
  v_before := swim.level_for((select t.xp from swim.totals(v_user) t));
  insert into swim.rewards (user_id, kind, xp, coins, quest_id, week) values (v_user, 'quest', q.reward_xp, q.reward_coins, p_quest, v_week);
  v_after := swim.level_for((select t.xp from swim.totals(v_user) t));
  v_lvl := v_before + 1;
  while v_lvl <= v_after loop
    v_inv := swim.grant_item(v_user, swim.roll_item(array[greatest(60 - 2 * v_lvl, 20), 28, 10 + v_lvl, 2 + v_lvl / 2.0]), 'level', null);
    v_items := v_items || jsonb_build_object('id', v_inv, 'item_id', (select item_id from swim.inventory where id = v_inv), 'source', 'level');
    v_lvl := v_lvl + 1;
  end loop;
  return jsonb_build_object('xp', q.reward_xp, 'coins', q.reward_coins, 'level_before', v_before, 'level_after', v_after, 'items', v_items);
end $$;

-- Stan integracji bez tokenów (dla ekranu ustawień).
create function swim.my_integrations()
returns table (provider text, athlete_id bigint, connected_at timestamptz, last_sync_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.provider, i.athlete_id, i.connected_at, i.last_sync_at from swim.integrations i where i.user_id = (select auth.uid())
$$;

create function swim.disconnect(p_provider text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from swim.integrations where user_id = (select auth.uid()) and provider = p_provider
$$;

create function swim.bootstrap() returns void
language sql volatile security invoker set search_path = '' as $$
  insert into swim.settings (user_id) values ((select auth.uid())) on conflict (user_id) do nothing;
$$;

-- ============ KATALOGI ============
insert into swim.items (id, name, slot, rarity, bonus_kind, bonus_pct, price, description, sort) values
  ('gogle-treningowe', 'Gogle treningowe', 'goggles', 'common', 'xp', 3, 50, 'Proste gogle na co dzień.', 1),
  ('czepek-silikonowy', 'Czepek silikonowy', 'cap', 'common', 'coins', 3, 40, 'Mniejszy opór, trochę więcej monet.', 2),
  ('deska', 'Deska do pływania', 'buoy', 'common', 'xp', 3, 60, 'Klasyka nóg.', 3),
  ('gogle-lustrzanki', 'Gogle lustrzanki', 'goggles', 'rare', 'coins', 6, 180, 'Na basen pod dachem i pod niebem.', 4),
  ('pletwy-krotkie', 'Płetwy krótkie', 'fins', 'rare', 'xp', 6, 220, 'Szybsze nogi, lepsza technika.', 5),
  ('osemka', 'Ósemka (pull buoy)', 'buoy', 'rare', 'coins', 6, 160, 'Same ręce, równa pozycja.', 6),
  ('lapki', 'Łapki', 'paddles', 'rare', 'xp', 6, 200, 'Mocniejszy chwyt wody.', 7),
  ('stroj-startowy', 'Strój startowy', 'suit', 'epic', 'xp', 10, 700, 'Kompresja jak na zawodach.', 8),
  ('lapki-karbonowe', 'Łapki karbonowe', 'paddles', 'epic', 'coins', 10, 600, 'Lekkie i sztywne.', 9),
  ('czepek-skupienia', 'Czepek Skupienia', 'cap', 'epic', 'xp', 10, 650, 'Głowa w wodzie, myśli w treningu.', 10),
  ('pletwy-krakena', 'Płetwy Krakena', 'fins', 'legendary', 'xp', 15, 2500, 'Podobno z łusek samego Krakena.', 11),
  ('czepek-mistrza', 'Czepek Mistrza', 'cap', 'legendary', 'coins', 15, 2000, 'Dla tych, którzy przepłynęli najwięcej.', 12);

insert into swim.quests (id, grp, title, kind, target, reward_xp, reward_coins) values
  ('dist-3k', 1, 'Przepłyń 3 km w tym tygodniu', 'distance', 3000, 120, 40),
  ('dist-5k', 1, 'Przepłyń 5 km w tym tygodniu', 'distance', 5000, 220, 80),
  ('dist-8k', 1, 'Przepłyń 8 km w tym tygodniu', 'distance', 8000, 400, 150),
  ('sess-2', 2, 'Dwa treningi w tym tygodniu', 'sessions', 2, 100, 30),
  ('sess-3', 2, 'Trzy treningi w tym tygodniu', 'sessions', 3, 180, 60),
  ('long-1500', 3, 'Jeden trening co najmniej 1500 m', 'long', 1500, 120, 40),
  ('long-2500', 3, 'Jeden trening co najmniej 2500 m', 'long', 2500, 250, 90),
  ('sets-8', 3, 'Trening z co najmniej 8 seriami', 'sets', 8, 120, 40);

-- ============ UPRAWNIENIA ============
-- Klient: odczyt; zapis tylko ustawień, serii, notatki/samopoczucia/basenu treningu i usuwanie własnych treningów.
revoke all on all tables in schema swim from anon, authenticated;
revoke execute on all functions in schema swim from public, anon, authenticated;
grant usage on schema swim to authenticated, service_role;
grant select on swim.pools, swim.lane_schedules, swim.items, swim.quests, swim.workouts, swim.workout_sets,
  swim.inventory, swim.rewards, swim.settings to authenticated;
grant insert, update on swim.settings to authenticated;
grant update (mood, note, pool_id, pool_length_m) on swim.workouts to authenticated;
grant delete on swim.workouts to authenticated;
grant insert, update, delete on swim.workout_sets to authenticated;
grant insert, update, delete on swim.pools, swim.lane_schedules to authenticated; -- RLS: tylko admin
grant all on all tables in schema swim to service_role;
grant usage on all sequences in schema swim to authenticated, service_role;
grant execute on function swim.is_admin(), swim.level_for(bigint), swim.log_workout(uuid, date, integer, integer, bigint, smallint, smallint, text, jsonb),
  swim.buy_item(text), swim.sell_item(uuid), swim.equip_item(uuid, boolean), swim.week_quests(date), swim.claim_quest(text, date),
  swim.my_integrations(), swim.disconnect(text), swim.bootstrap() to authenticated;
grant execute on all functions in schema swim to service_role;
