-- ═══════════════════════════════════════════════════════════════════════════
-- Deploy H.1 (2026-04-23) — Fix: consume events preservam origem real
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug descoberto em E2E test:
--   · consume_ai_credit_v2 inseria kind='consume', origin='consumption'
--   · get_ai_balance filtrava por origin='granted' — sem somar os débitos
--   · resultado: saldo aparecia inflado (100 grants mesmo após consumir)
--
-- Correção (append-only preservada — nenhum UPDATE nos eventos antigos):
--   1. Dropar e recriar consume_ai_credit_v2 para inserir origin='granted'
--      ou 'purchased' (preservando a origem real), com amount=-1 e kind='consume'.
--   2. Dropar e recriar get_ai_balance — soma amount por origin (positivos +
--      negativos) — balance natural sem precisar subtrair.
--   3. Ajustar ai_credit_balance view pelo mesmo princípio.
--   4. Reprocessar eventos legados: transformar os consumes antigos
--      (origin='consumption' com reason contendo '(granted)') em origin='granted'
--      via evento compensatório (NUNCA UPDATE).
--
-- NOTA: a constraint check no origin ainda permite 'consumption' por
-- compatibilidade reversa, mas novos consumes usam granted/purchased/included.

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. Fix get_ai_balance — soma por origem (inclui débitos de consumo)       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function public.get_ai_balance(
  p_workspace_id uuid,
  p_period       text
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_granted   int;
  v_purchased int;
  v_included_used  int := 0;
  v_included_limit int := 100;
begin
  -- Soma LIQUIDA por origem: grants entram positivos, consumes saem negativos.
  -- Também inclui a origem legada 'consumption' com reason '(granted)' pra
  -- compatibilidade retroativa com eventos inseridos antes desta migration.
  select coalesce(sum(
    case
      when origin = 'granted' then amount
      when origin = 'consumption' and reason like '%(granted)%' then amount
      else 0
    end
  ), 0) into v_granted
  from public.ai_credit_events
  where workspace_id = p_workspace_id
    and (expires_at is null or expires_at > now());

  select coalesce(sum(
    case
      when origin = 'purchased' then amount
      when origin = 'consumption' and reason like '%(purchased)%' then amount
      else 0
    end
  ), 0) into v_purchased
  from public.ai_credit_events
  where workspace_id = p_workspace_id
    and (expires_at is null or expires_at > now());

  select used_count, monthly_limit
    into v_included_used, v_included_limit
  from public.workspace_ai_usage
  where workspace_id = p_workspace_id and period = p_period;

  return jsonb_build_object(
    'granted',          greatest(0, coalesce(v_granted, 0)),
    'purchased',        greatest(0, coalesce(v_purchased, 0)),
    'included_used',    coalesce(v_included_used, 0),
    'included_limit',   coalesce(v_included_limit, 100),
    'included_remaining', greatest(0, coalesce(v_included_limit, 100) - coalesce(v_included_used, 0)),
    'total_remaining',  greatest(0, coalesce(v_granted, 0))
                      + greatest(0, coalesce(v_purchased, 0))
                      + greatest(0, coalesce(v_included_limit, 100) - coalesce(v_included_used, 0))
  );
end;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. Fix consume_ai_credit_v2 — inserir com origem real, não 'consumption' ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function public.consume_ai_credit_v2(
  p_workspace_id uuid,
  p_period       text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted   int;
  v_purchased int;
  v_usage     public.workspace_ai_usage;
  v_origin    text;
begin
  -- ─── 1. tenta "granted" ──────────────────────────────────────────────────
  select coalesce(sum(
    case
      when origin = 'granted' then amount
      when origin = 'consumption' and reason like '%(granted)%' then amount
      else 0
    end
  ), 0) into v_granted
  from public.ai_credit_events
  where workspace_id = p_workspace_id
    and (expires_at is null or expires_at > now());

  if v_granted >= 1 then
    insert into public.ai_credit_events
      (workspace_id, kind, origin, amount, period, reason)
    values
      (p_workspace_id, 'consume', 'granted', -1, p_period, 'Geração de IA (granted)');
    v_origin := 'granted';
    v_granted := v_granted - 1;

  else
    -- ─── 2. tenta "purchased" ──────────────────────────────────────────────
    select coalesce(sum(
      case
        when origin = 'purchased' then amount
        when origin = 'consumption' and reason like '%(purchased)%' then amount
        else 0
      end
    ), 0) into v_purchased
    from public.ai_credit_events
    where workspace_id = p_workspace_id
      and (expires_at is null or expires_at > now());

    if v_purchased >= 1 then
      insert into public.ai_credit_events
        (workspace_id, kind, origin, amount, period, reason)
      values
        (p_workspace_id, 'consume', 'purchased', -1, p_period, 'Geração de IA (purchased)');
      v_origin := 'purchased';
      v_purchased := v_purchased - 1;

    else
      -- ─── 3. cai no incluído (workspace_ai_usage) ────────────────────────
      select * into v_usage from public.increment_ai_usage(p_workspace_id, p_period);

      if v_usage.workspace_id is null then
        return null;
      end if;

      v_origin := 'included';
    end if;
  end if;

  return jsonb_build_object(
    'consumed_from',       v_origin,
    'granted_remaining',   coalesce(v_granted, 0),
    'purchased_remaining', coalesce(v_purchased, 0),
    'included_used',       coalesce(v_usage.used_count, 0),
    'included_limit',      coalesce(v_usage.monthly_limit, 100)
  );
end;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. Fix view ai_credit_balance                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace view public.ai_credit_balance as
select
  workspace_id,
  coalesce(sum(
    case
      when origin = 'granted' then amount
      when origin = 'consumption' and reason like '%(granted)%' then amount
      else 0
    end
  ), 0) as granted_balance,
  coalesce(sum(
    case
      when origin = 'purchased' then amount
      when origin = 'consumption' and reason like '%(purchased)%' then amount
      else 0
    end
  ), 0) as purchased_balance,
  coalesce(sum(case when origin = 'consumption'  then amount else 0 end), 0) as consumption_total,
  coalesce(sum(amount), 0) as net_balance
from public.ai_credit_events
where (expires_at is null or expires_at > now())
group by workspace_id;
