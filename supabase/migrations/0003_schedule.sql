-- Faza 2 — harmonogramy: obsługa zgłoszeń kind='schedule' w apply_contribution.
-- payload: { "replace": bool, "entries": [ { dzien, tor, od, do, status, sekcja, opis } ] }
-- W bazie trzymamy sloty ZAJĘTE; reszta osi to czas wolny.

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
        -- Opcjonalnie zastąp cały dotychczasowy harmonogram basenu.
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
    end if;
end;
$$;
