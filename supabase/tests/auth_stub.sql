-- Minimalna imitacja środowiska Supabase dla testów na czystym Postgresie (lokalnie i w CI).
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

-- Vault, pg_cron i pg_net: tylko tyle, ile potrzebują migracje
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema cron;
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
