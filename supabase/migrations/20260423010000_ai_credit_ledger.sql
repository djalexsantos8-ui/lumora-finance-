-- ═══════════════════════════════════════════════════════════════════════════
-- Deploy H (2026-04-23) — AI credit ledger (grants + purchased)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por quê:
--   · workspace_ai_usage (Deploy D) só tem "used vs monthly_limit".
--     Não distingue ORIGEM do crédito (incluído no plano, comprado via Stripe,
--     concedido manualmente pelo admin).
--   · Sem distinção de origem, é impossível: (a) dar cortesia por contato
--     humano sem gastar o limite do plano; (b) vender pacote extra; (c) auditar
--     quanto já foi concedido.
--   · Este ledger é APPEND-ONLY: cada crédito concedido/comprado vira um evento
--     com amount positivo; cada consumo vira evento com amount negativo. Saldo
--     = soma(amount) por origem.
--
-- IMPORTANTE:
--   · NÃO substitui workspace_ai_usage — continua sendo a fonte de verdade do
--     plano mensal (100 créditos/mês que resetam).
--   · Ordem de consumo: granted → purchased → included (favorece o usuário,
--     gasta primeiro o que é "bônus", deixa o plano mensal intacto quando
--     possível).
--   · expires_at é soft: consume_ai_credit_v2 ignora eventos expirados.
--     Grant sem expires_at é perpétuo.
--
-- Schema:
--   ai_credit_events (
--     id uuid, workspace_id uuid, kind text (grant|purchase|consume|expire|refund),
--     origin text (included|granted|purchased|consumption),
--     amount int (+ = entrada; - = saída),
--     expires_at, reason, created_by (admin user_id),
--     stripe_event_id (opcional), meta jsonb, created_at
--   )
--
--   ai_credit_balance VIEW — saldo por workspace, agregado por origem
--     (inclui só eventos não expirados; consumo entra como débito)
--
-- RPC:
--   · grant_ai_credits(workspace_id, amount, reason, expires_at) — admin only,
--     cria evento de grant
--   · consume_ai_credit_v2(workspace_id, period) — tenta granted primeiro,
--     depois purchased, depois cai no increment_ai_usage (included).
--     Retorna jsonb com origem + saldos atualizados.
--   · get_ai_balance(workspace_id) — retorna jsonb com breakdown

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. Tabela principal                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.ai_credit_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,

  kind            text not null check (kind in ('grant', 'purchase', 'consume', 'expire', 'refund')),
  origin          text not null check (origin in ('included', 'granted', 'purchased', 'consumption')),
  amount          int  not null,

  expires_at      timestamptz,
  period          text,  -- YYYY-MM, opcional (usado para consumos de "included")

  reason          text,
  created_by      uuid,                -- user_id do admin que concedeu, null se automático
  stripe_event_id text,
  meta            jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now()
);

comment on table public.ai_credit_events is
  'Append-only ledger de créditos de IA. Saldo = soma(amount) por origem. NÃO apagar linhas — use eventos compensatórios (refund/expire).';
comment on column public.ai_credit_events.amount is
  'Positivo = entrada (grant/purchase/refund). Negativo = saída (consume/expire).';
comment on column public.ai_credit_events.origin is
  'included = plano mensal (registrado em workspace_ai_usage, evento aqui é redundante); granted = cortesia admin; purchased = Stripe; consumption = débito.';

create index if not exists idx_ai_credit_events_workspace_time
  on public.ai_credit_events(workspace_id, created_at desc);
create index if not exists idx_ai_credit_events_origin
  on public.ai_credit_events(workspace_id, origin, expires_at);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. View de saldo                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace view public.ai_credit_balance as
select
  workspace_id,
  coalesce(sum(case when origin = 'granted'      then amount else 0 end), 0) as granted_balance,
  coalesce(sum(case when origin = 'purchased'    then amount else 0 end), 0) as purchased_balance,
  coalesce(sum(case when origin = 'consumption'  then amount else 0 end), 0) as consumption_total,
  coalesce(sum(amount), 0) as net_balance
from public.ai_credit_events
where (expires_at is null or expires_at > now())
group by workspace_id;

comment on view public.ai_credit_balance is
  'Saldo de créditos por workspace (origem granted + purchased + consumption). NÃO inclui incluídos do plano (ver workspace_ai_usage).';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. RPC: grant_ai_credits (admin only)                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function public.grant_ai_credits(
  p_workspace_id uuid,
  p_amount       int,
  p_reason       text default null,
  p_expires_at   timestamptz default null
)
returns public.ai_credit_events
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.ai_credit_events;
begin
  -- Só admin pode conceder créditos
  if not public.is_current_user_admin() then
    raise exception 'Apenas administradores podem conceder créditos de IA';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Quantidade de créditos deve ser positiva (recebido: %)', p_amount;
  end if;

  insert into public.ai_credit_events
    (workspace_id, kind, origin, amount, expires_at, reason, created_by)
  values
    (p_workspace_id, 'grant', 'granted', p_amount, p_expires_at, p_reason, auth.uid())
  returning * into result;

  return result;
end;
$$;

grant execute on function public.grant_ai_credits(uuid, int, text, timestamptz)
  to authenticated;

comment on function public.grant_ai_credits(uuid, int, text, timestamptz) is
  'Admin concede N créditos de IA a um workspace. Amount > 0. expires_at null = perpétuo. Só chamável por admin (is_current_user_admin).';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. RPC: consume_ai_credit_v2                                              ║
-- ║    Ordem: granted → purchased → included (workspace_ai_usage)             ║
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
  select coalesce(sum(amount), 0) into v_granted
  from public.ai_credit_events
  where workspace_id = p_workspace_id
    and origin = 'granted'
    and (expires_at is null or expires_at > now());

  if v_granted >= 1 then
    insert into public.ai_credit_events
      (workspace_id, kind, origin, amount, period, reason)
    values
      (p_workspace_id, 'consume', 'consumption', -1, p_period, 'Geração de IA (granted)');
    v_origin := 'granted';
    v_granted := v_granted - 1;

  else
    -- ─── 2. tenta "purchased" ──────────────────────────────────────────────
    select coalesce(sum(amount), 0) into v_purchased
    from public.ai_credit_events
    where workspace_id = p_workspace_id
      and origin = 'purchased'
      and (expires_at is null or expires_at > now());

    if v_purchased >= 1 then
      insert into public.ai_credit_events
        (workspace_id, kind, origin, amount, period, reason)
      values
        (p_workspace_id, 'consume', 'consumption', -1, p_period, 'Geração de IA (purchased)');
      v_origin := 'purchased';
      v_purchased := v_purchased - 1;

    else
      -- ─── 3. cai no incluído (workspace_ai_usage) ────────────────────────
      select * into v_usage from public.increment_ai_usage(p_workspace_id, p_period);

      if v_usage.workspace_id is null then
        -- limite estourado em TODAS as origens
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

grant execute on function public.consume_ai_credit_v2(uuid, text)
  to authenticated;

comment on function public.consume_ai_credit_v2(uuid, text) is
  'Consome 1 crédito de IA. Ordem: granted → purchased → included. Retorna jsonb {consumed_from, granted_remaining, purchased_remaining, included_used, included_limit} ou NULL se esgotou tudo.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. RPC: get_ai_balance                                                    ║
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
  select coalesce(sum(amount), 0) into v_granted
  from public.ai_credit_events
  where workspace_id = p_workspace_id
    and origin = 'granted'
    and (expires_at is null or expires_at > now());

  select coalesce(sum(amount), 0) into v_purchased
  from public.ai_credit_events
  where workspace_id = p_workspace_id
    and origin = 'purchased'
    and (expires_at is null or expires_at > now());

  select used_count, monthly_limit
    into v_included_used, v_included_limit
  from public.workspace_ai_usage
  where workspace_id = p_workspace_id and period = p_period;

  return jsonb_build_object(
    'granted',          coalesce(v_granted, 0),
    'purchased',        coalesce(v_purchased, 0),
    'included_used',    coalesce(v_included_used, 0),
    'included_limit',   coalesce(v_included_limit, 100),
    'included_remaining', greatest(0, coalesce(v_included_limit, 100) - coalesce(v_included_used, 0)),
    'total_remaining',  coalesce(v_granted, 0)
                      + coalesce(v_purchased, 0)
                      + greatest(0, coalesce(v_included_limit, 100) - coalesce(v_included_used, 0))
  );
end;
$$;

grant execute on function public.get_ai_balance(uuid, text) to authenticated;

comment on function public.get_ai_balance(uuid, text) is
  'Retorna breakdown de créditos de IA: granted, purchased, included_used/limit/remaining, total_remaining.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. RLS                                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

alter table public.ai_credit_events enable row level security;

drop policy if exists ai_credit_events_member_select on public.ai_credit_events;
drop policy if exists ai_credit_events_admin_all     on public.ai_credit_events;

-- Member ativo lê os eventos do próprio workspace (histórico)
create policy ai_credit_events_member_select on public.ai_credit_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = ai_credit_events.workspace_id
        and  wm.user_id      = auth.uid()
        and  wm.status       = 'active'
    )
  );

-- Admin vê tudo e escreve tudo (pra poder conceder pela UI)
create policy ai_credit_events_admin_all on public.ai_credit_events
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- ── nota ─────────────────────────────────────────────────────────────────────
-- INSERTs de consumo vêm sempre via RPC SECURITY DEFINER (bypass de RLS).
-- INSERTs de grant vêm via grant_ai_credits (também SECURITY DEFINER, mas
-- com assert interno de is_current_user_admin).
