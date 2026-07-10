-- Faza 1 — zgłoszenia społeczności + moderacja.
-- Uruchom w Supabase: SQL Editor -> wklej -> Run.

-- =====================================================================
-- 1. Kolumny stanu/autorstwa dla basenów + poprawka RLS.
-- =====================================================================

alter table public.places
    add column if not exists status text not null default 'published'
        check (status in ('published', 'pending', 'rejected', 'hidden')),
    add column if not exists created_by uuid references auth.users(id),
    add column if not exists updated_at timestamptz not null default now();

-- Pomocnik: czy bieżący użytkownik jest moderatorem (trusted/admin).
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('trusted', 'admin')
    );
$$;

-- WAŻNE: dotąd RLS na places obejmował tylko rolę anon, więc po zalogowaniu
-- użytkownik nie widział żadnych basenów. Dodajemy politykę dla zalogowanych:
-- widzą opublikowane, a moderatorzy wszystko.
drop policy if exists places_select_authenticated on public.places;
create policy places_select_authenticated on public.places
    for select to authenticated
    using (status = 'published' or public.is_moderator());

-- =====================================================================
-- 2. Tabela zgłoszeń (jedna kolejka dla wszystkich typów wkładu).
-- =====================================================================

create table if not exists public.contributions (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('new_place', 'edit_place', 'schedule', 'photo')),
    place_id bigint references public.places(id) on delete cascade,
    payload jsonb not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    author uuid not null default auth.uid() references auth.users(id),
    reviewer uuid references auth.users(id),
    review_note text,
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
);

alter table public.contributions enable row level security;

-- Zalogowany może dodać zgłoszenie w swoim imieniu.
drop policy if exists contributions_insert on public.contributions;
create policy contributions_insert on public.contributions
    for insert to authenticated
    with check (author = auth.uid());

-- Widzi własne zgłoszenia; moderator widzi wszystkie.
drop policy if exists contributions_select on public.contributions;
create policy contributions_select on public.contributions
    for select to authenticated
    using (author = auth.uid() or public.is_moderator());

-- Zatwierdzać/odrzucać może tylko moderator.
drop policy if exists contributions_update on public.contributions;
create policy contributions_update on public.contributions
    for update to authenticated
    using (public.is_moderator())
    with check (public.is_moderator());

-- =====================================================================
-- 3. Zastosowanie zgłoszenia do "żywych" danych (SECURITY DEFINER).
-- =====================================================================

create or replace function public.apply_contribution(c public.contributions)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if c.kind = 'new_place' then
        insert into public.places (nazwa, lat, lng, godziny, cennik, strona, ocena, liczba_torow, status, created_by)
        values (
            c.payload->>'nazwa',
            (c.payload->>'lat')::numeric,
            (c.payload->>'lng')::numeric,
            nullif(c.payload->>'godziny', ''),
            nullif(c.payload->>'cennik', ''),
            nullif(c.payload->>'strona', ''),
            nullif(c.payload->>'ocena', ''),
            coalesce((c.payload->>'liczba_torow')::int, 6),
            'published',
            c.author
        );
    elsif c.kind = 'edit_place' then
        update public.places set
            godziny = coalesce(nullif(c.payload->>'godziny', ''), godziny),
            cennik  = coalesce(nullif(c.payload->>'cennik', ''), cennik),
            strona  = coalesce(nullif(c.payload->>'strona', ''), strona),
            updated_at = now()
        where id = c.place_id;
    end if;
end;
$$;

-- Zaufani/admini publikują od razu: ustaw status 'approved' już przy wstawianiu.
create or replace function public.handle_new_contribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    author_role text;
begin
    select role into author_role from public.profiles where id = new.author;
    if author_role in ('trusted', 'admin') then
        new.status := 'approved';
        new.reviewer := new.author;
        new.reviewed_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists before_insert_contribution on public.contributions;
create trigger before_insert_contribution
    before insert on public.contributions
    for each row execute function public.handle_new_contribution();

-- Po zatwierdzeniu (od razu przez zaufanego albo później przez moderatora)
-- zastosuj zmianę do bazy basenów.
create or replace function public.on_contribution_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'approved'
       and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
        perform public.apply_contribution(new);
    end if;
    return new;
end;
$$;

drop trigger if exists after_contribution_upsert on public.contributions;
create trigger after_contribution_upsert
    after insert or update on public.contributions
    for each row execute function public.on_contribution_approved();
