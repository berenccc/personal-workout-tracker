-- Личный режим: суточные тарифные лимиты AI больше не применяются.
create or replace function public.consume_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('allowed', true, 'limit', null, 'remaining', null);
end;
$$;
