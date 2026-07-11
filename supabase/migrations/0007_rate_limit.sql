-- Faza P1 — rate-limiting dla Edge Functions (anty-nadużycia, plan §8).
-- Licznik w oknie czasowym per (user, action). Dostęp tylko rola serwisowa.

create table if not exists public.edge_rate_limits (
    user_id uuid not null references auth.users(id) on delete cascade,
    action text not null,
    window_start timestamptz not null default now(),
    count int not null default 0,
    primary key (user_id, action)
);
-- RLS włączone bez polityk => klient nie ma dostępu; service_role omija RLS.
alter table public.edge_rate_limits enable row level security;

-- Atomowo „konsumuje" jeden token limitu. Zwraca:
--   { allowed: bool, remaining: int, retry_after: int (sekundy) }
create or replace function public.consume_rate_limit(
    p_user uuid,
    p_action text,
    p_max int,
    p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    win interval := make_interval(secs => p_window_seconds);
    rec public.edge_rate_limits;
    now_ts timestamptz := now();
begin
    insert into public.edge_rate_limits (user_id, action, window_start, count)
    values (p_user, p_action, now_ts, 0)
    on conflict (user_id, action) do nothing;

    select * into rec from public.edge_rate_limits
    where user_id = p_user and action = p_action
    for update;

    -- Okno minęło: reset i zaliczenie pierwszego wywołania.
    if now_ts - rec.window_start >= win then
        update public.edge_rate_limits
            set window_start = now_ts, count = 1
        where user_id = p_user and action = p_action;
        return jsonb_build_object('allowed', true, 'remaining', p_max - 1, 'retry_after', 0);
    end if;

    -- W oknie, poniżej limitu: zalicz.
    if rec.count < p_max then
        update public.edge_rate_limits set count = count + 1
        where user_id = p_user and action = p_action;
        return jsonb_build_object('allowed', true, 'remaining', p_max - rec.count - 1, 'retry_after', 0);
    end if;

    -- Limit wyczerpany.
    return jsonb_build_object(
        'allowed', false,
        'remaining', 0,
        'retry_after', ceil(extract(epoch from (rec.window_start + win - now_ts)))::int
    );
end;
$$;
