-- Faza 0 — Konta: profile użytkowników.
-- Uruchom w Supabase: SQL Editor -> wklej -> Run, albo przez Supabase CLI.

-- 1. Tabela profili (1:1 z auth.users). xp/level pod przyszłą grywalizację.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role text not null default 'user' check (role in ('user', 'trusted', 'admin')),
    xp integer not null default 0,
    level integer not null default 1,
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Polityki RLS.
-- Publiczny odczyt (display_name/role/level potrzebne w UI społeczności).
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
    on public.profiles for select
    using (true);

-- Użytkownik może aktualizować własny profil (ograniczenie pól — trigger niżej).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- 3. Ochrona pól wrażliwych: rolę/xp/level zmienia tylko rola serwisowa
--    (Edge Functions / panel admina), nigdy sam użytkownik z klienta.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
    if (new.role is distinct from old.role
        or new.xp is distinct from old.xp
        or new.level is distinct from old.level)
       and auth.role() <> 'service_role' then
        raise exception 'Brak uprawnień do zmiany pól role/xp/level';
    end if;
    return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
    before update on public.profiles
    for each row execute function public.protect_profile_fields();

-- 4. Automatyczne tworzenie profilu przy rejestracji użytkownika.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            split_part(new.email, '@', 1)
        )
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
