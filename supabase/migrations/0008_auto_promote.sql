-- Faza P2 — automatyczny awans do roli 'trusted' po progu zatwierdzonych zgłoszeń.
-- Odciąża moderację: po N zaakceptowanych wkładach zwykły user publikuje od razu.
-- Admin nie jest ruszany; degradacji nie ma (tylko user -> trusted).

create or replace function public.maybe_promote_trusted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    threshold constant int := 5;   -- liczba zatwierdzonych zgłoszeń do awansu
    approved_count int;
    current_role text;
begin
    -- Reaguj tylko na wejście w stan 'approved'.
    if new.status = 'approved'
       and (tg_op = 'INSERT' or old.status is distinct from 'approved') then

        select role into current_role from public.profiles where id = new.author;

        if current_role = 'user' then
            select count(*) into approved_count
            from public.contributions
            where author = new.author and status = 'approved';

            if approved_count >= threshold then
                update public.profiles
                    set role = 'trusted'
                where id = new.author and role = 'user';
            end if;
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists after_contribution_promote on public.contributions;
create trigger after_contribution_promote
    after insert or update on public.contributions
    for each row execute function public.maybe_promote_trusted();
