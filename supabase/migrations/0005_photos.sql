-- Faza 3 — zdjęcia basenów: tabela, Storage, moderacja.

-- =====================================================================
-- 1. Tabela zdjęć. Publiczny odczyt tylko zatwierdzonych; autor widzi swoje.
-- =====================================================================
create table if not exists public.place_photos (
    id uuid primary key default gen_random_uuid(),
    place_id bigint not null references public.places(id) on delete cascade,
    storage_path text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    author uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now()
);
alter table public.place_photos enable row level security;

drop policy if exists place_photos_select on public.place_photos;
create policy place_photos_select on public.place_photos
    for select
    using (status = 'approved' or author = auth.uid() or public.is_moderator());

drop policy if exists place_photos_insert on public.place_photos;
create policy place_photos_insert on public.place_photos
    for insert to authenticated
    with check (author = auth.uid());

-- =====================================================================
-- 2. Bucket Storage + polityki (publiczny odczyt, upload dla zalogowanych).
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

drop policy if exists place_photos_obj_read on storage.objects;
create policy place_photos_obj_read on storage.objects
    for select
    using (bucket_id = 'place-photos');

drop policy if exists place_photos_obj_insert on storage.objects;
create policy place_photos_obj_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'place-photos');

-- =====================================================================
-- 3. apply_contribution: dochodzi gałąź 'photo' (zatwierdza zdjęcie).
--    Pełna definicja z wszystkimi typami wkładu.
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

    elsif c.kind = 'schedule' then
        if coalesce((c.payload->>'replace')::boolean, false) then
            delete from public.harmonogram_torow where place_id = c.place_id;
        end if;
        insert into public.harmonogram_torow
            (place_id, dzien_tygodnia, sekcja, tor, godzina_od, godzina_do, status, opis)
        select
            c.place_id,
            e->>'dzien',
            nullif(e->>'sekcja', ''),
            (e->>'tor')::int,
            (e->>'od')::time,
            (e->>'do')::time,
            coalesce(nullif(e->>'status', ''), 'zajecia'),
            nullif(e->>'opis', '')
        from jsonb_array_elements(c.payload->'entries') as e;

    elsif c.kind = 'photo' then
        update public.place_photos
        set status = 'approved'
        where id = (c.payload->>'photo_id')::uuid and place_id = c.place_id;
    end if;
end;
$$;
