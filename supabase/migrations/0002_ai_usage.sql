-- Суточные лимиты AI. Клиент может только прочитать собственную статистику;
-- счётчик увеличивается атомарно через security definer функцию.
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;

create policy "ai_usage_select_own" on public.ai_daily_usage
  for select using (auth.uid() = user_id);

create or replace function public.consume_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  daily_limit integer;
  new_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select case when plan in ('pro', 'premium') then 100 else 15 end
    into daily_limit
    from public.profiles
    where id = current_user_id;

  daily_limit := coalesce(daily_limit, 15);

  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (current_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = public.ai_daily_usage.request_count + 1,
        updated_at = now()
    where public.ai_daily_usage.request_count < daily_limit
  returning request_count into new_count;

  if new_count is null then
    return jsonb_build_object('allowed', false, 'limit', daily_limit, 'remaining', 0);
  end if;

  return jsonb_build_object(
    'allowed', true,
    'limit', daily_limit,
    'remaining', greatest(daily_limit - new_count, 0)
  );
end;
$$;

revoke all on function public.consume_ai_request() from public;
grant execute on function public.consume_ai_request() to authenticated;
