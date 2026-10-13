-- Import basenów z OpenStreetMap (odpowiedź Overpass API w formacie JSON).
-- Uruchamiane ręcznie z SQL Editora / przez pg_net — tylko rola serwisowa i właściciel bazy.
-- Kryteria zapytania (README): leisure=sports_centre + sport~swimming, leisure=water_park,
-- leisure=swimming_pool z nazwą i bez dostępu prywatnego. Basen leżący w promieniu ~150 m od
-- centrum sportowego / aquaparku to ten sam obiekt i jest pomijany.

create function swim.import_osm(p_data jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with els as (
    select (e ->> 'type') || '/' || (e ->> 'id') as osm_id,
           e -> 'tags' as t,
           coalesce((e ->> 'lat')::float8, (e -> 'center' ->> 'lat')::float8) as lat,
           coalesce((e ->> 'lon')::float8, (e -> 'center' ->> 'lon')::float8) as lng
    from jsonb_array_elements(p_data -> 'elements') e
  ), typed as (
    select osm_id, lat, lng,
      left(btrim(t ->> 'name'), 120) as name,
      left(nullif(btrim(coalesce(t ->> 'addr:city', t ->> 'addr:place')), ''), 80) as city,
      left(nullif(btrim(concat_ws(' ', t ->> 'addr:street', t ->> 'addr:housenumber')), ''), 120) as street,
      case t ->> 'leisure' when 'sports_centre' then 'sports_centre' when 'water_park' then 'water_park' else 'pool' end as kind,
      left(coalesce(t ->> 'website', t ->> 'contact:website', t ->> 'url'), 300) as website,
      left(coalesce(t ->> 'phone', t ->> 'contact:phone'), 60) as phone,
      left(t ->> 'opening_hours', 500) as opening_hours,
      case when (t ->> 'length') ~ '^\d{2,3}(\.\d+)?( ?m)?$'
           then nullif(least(greatest(round(substring(t ->> 'length' from '^\d{2,3}(?:\.\d+)?')::numeric), 0), 101), 0) end as length_raw,
      case when (t ->> 'lanes') ~ '^\d{1,2}$' then (t ->> 'lanes')::integer end as lanes_raw
    from els
    where lat is not null and coalesce(btrim(t ->> 'name'), '') <> ''
  ), dedup as (
    select * from typed a
    where a.kind <> 'pool' or not exists (
      select 1 from typed b where b.kind <> 'pool' and abs(a.lat - b.lat) < 0.0015 and abs(a.lng - b.lng) < 0.0025)
  )
  insert into swim.pools (osm_id, name, city, street, lat, lng, kind, website, phone, opening_hours, length_m, lanes)
  select osm_id, name, city, street, lat, lng, kind, website, phone, opening_hours,
         case when length_raw between 10 and 100 then length_raw end,
         case when lanes_raw between 1 and 20 then lanes_raw end
  from dedup
  on conflict (osm_id) do update set
    name = excluded.name, city = excluded.city, street = excluded.street, lat = excluded.lat, lng = excluded.lng,
    kind = excluded.kind, website = excluded.website, phone = excluded.phone, opening_hours = excluded.opening_hours,
    length_m = coalesce(excluded.length_m, swim.pools.length_m), lanes = coalesce(excluded.lanes, swim.pools.lanes),
    updated_at = now();
  get diagnostics v_count = row_count;
  -- duplikaty między kolejnymi importami: basen przy centrum sportowym / aquaparku chowamy
  update swim.pools p set hidden = true
   where p.kind = 'pool' and not p.hidden and exists (
     select 1 from swim.pools c where c.kind <> 'pool' and abs(c.lat - p.lat) < 0.0015 and abs(c.lng - p.lng) < 0.0025);
  return v_count;
end $$;

revoke execute on function swim.import_osm(jsonb) from public, anon, authenticated;
grant execute on function swim.import_osm(jsonb) to service_role;
