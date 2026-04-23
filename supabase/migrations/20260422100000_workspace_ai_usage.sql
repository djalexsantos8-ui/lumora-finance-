-- ═══════════════════════════════════════════════════════════════════════════
-- Deploy D (2026-04-22) — AI usage & quota per workspace
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por quê:
--   · "Copilot" do Lumora (gerar campos com IA) precisa controlar uso pra
--     não explodir custo de OpenAI e pra habilitar upsell ("100 gerações/mês").
--   · Contagem por workspace + mês (YYYY-MM) — reset automático todo mês
--     sem job: a linha nova do mês zera.
--   · monthly_limit por linha permite ajuste manual (trial, cupom, admin).
--
-- Schema:
--   workspace_ai_usage (
--     workspace_id uuid,
--     period        text   — YYYY-MM (ex: 2026-04)
--     used_count    int
--     monthly_limit int    — default 100; admin pode ajustar
--     created_at/updated_at
--     PRIMARY KEY (workspace_id, period)
--   )
--
-- RPC atômica increment_ai_usage(workspace_id, period) — retorna a linha após
-- incrementar. Usa INSERT … ON CONFLICT DO UPDATE SET used_count = … + 1
-- pra evitar race condition. Não permite passar o limite (retorna NULL se
-- estouraria).
--
-- RLS: só members ativos do workspace podem SELECT. INSERT/UPDATE só via RPC
-- (SECURITY DEFINER) — UI nunca escreve direto.

-- ─── TABELA ──────────────────────────────────────────────────────────────────

create table if not exists public.workspace_ai_usage (
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  period         text        not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  used_count     int         not null default 0 check (used_count >= 0),
  monthly_limit  int         not null default 100 check (monthly_limit >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, period)
);

comment on table public.workspace_ai_usage is
  'Contador mensal de gerações de IA por workspace. PK composta (workspace_id, period). Reset automático por mês — linha nova zera.';
comment on column public.workspace_ai_usage.period is
  'Mês no formato YYYY-MM (ex: 2026-04). Derivado de to_char(now(), ''YYYY-MM'').';
comment on column public.workspace_ai_usage.monthly_limit is
  'Limite de gerações no mês. Default 100. Admin pode ajustar (trial, cupom).';

create index if not exists workspace_ai_usage_workspace_period_idx
  on public.workspace_ai_usage(workspace_id, period);

-- ─── TRIGGER: updated_at ─────────────────────────────────────────────────────

create or replace function public.workspace_ai_usage_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workspace_ai_usage_set_updated_at on public.workspace_ai_usage;
create trigger workspace_ai_usage_set_updated_at
  before update on public.workspace_ai_usage
  for each row execute function public.workspace_ai_usage_set_updated_at();

-- ─── RPC: increment_ai_usage (atômico) ───────────────────────────────────────
--
-- Contrato:
--   · Se (workspace_id, period) não existe → INSERT com used_count=1
--   · Se existe e used_count < monthly_limit → UPDATE used_count = used_count+1
--   · Se existe e used_count >= monthly_limit → NÃO incrementa (retorna null)
--
-- Retorna a linha pós-incremento (ou null se estourou o limite). O caller
-- server-side decide: null → toast "créditos esgotados"; linha → segue com
-- a chamada do OpenAI.

create or replace function public.increment_ai_usage(
  p_workspace_id uuid,
  p_period       text
)
returns public.workspace_ai_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.workspace_ai_usage;
begin
  -- Primeiro tenta criar/incrementar.
  insert into public.workspace_ai_usage (workspace_id, period, used_count)
  values (p_workspace_id, p_period, 1)
  on conflict (workspace_id, period) do update
    set used_count = public.workspace_ai_usage.used_count + 1
    where public.workspace_ai_usage.used_count < public.workspace_ai_usage.monthly_limit
  returning * into result;

  -- Se nada foi retornado, o UPDATE não passou no WHERE — limite estourado.
  -- Ainda precisamos lidar com o caso em que a linha existia e tava em limite:
  -- ON CONFLICT DO UPDATE … WHERE false não retorna; result fica NULL.
  if result.workspace_id is null then
    return null;
  end if;

  return result;
end;
$$;

grant execute on function public.increment_ai_usage(uuid, text) to authenticated;

comment on function public.increment_ai_usage(uuid, text) is
  'Incrementa atomicamente o contador de IA do workspace no período. Retorna a linha ou NULL se o limite foi atingido.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.workspace_ai_usage enable row level security;

drop policy if exists workspace_ai_usage_member_select on public.workspace_ai_usage;
drop policy if exists workspace_ai_usage_admin_all     on public.workspace_ai_usage;

-- Member ativo: SELECT own workspace usage
create policy workspace_ai_usage_member_select on public.workspace_ai_usage
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = workspace_ai_usage.workspace_id
        and  wm.user_id      = auth.uid()
        and  wm.status       = 'active'
    )
  );

-- Admin: tudo (pra Settings → Créditos + painel de admin poder ajustar limite)
create policy workspace_ai_usage_admin_all on public.workspace_ai_usage
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- ── nota ─────────────────────────────────────────────────────────────────────
-- INSERT/UPDATE do usuário final sempre passam pela RPC (SECURITY DEFINER),
-- que bypassa RLS do lado do servidor. Isso é intencional: usuário NÃO escreve
-- direto na tabela — ele pede à função pra incrementar.
