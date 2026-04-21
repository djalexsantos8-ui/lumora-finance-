-- ═══════════════════════════════════════════════════════════════════════════
-- Contratos — Módulo Builder (2026-04-21)
--
-- Motivação: substituir a galeria de templates estáticos por um Contract
-- Builder real, conectado aos dados vivos do sistema (orçamento, freelance,
-- pedido, receita recorrente, cliente, configurações).
--
-- Regra de ouro: TUDO aditivo e idempotente. Schema não mexe em nada
-- existente. Rollback abaixo.
--
-- ROLLBACK (manual, se precisar reverter):
--   drop table if exists public.contracts cascade;
--   alter table public.workspace_settings
--     drop column if exists company_legal_name,
--     drop column if exists company_cnpj,
--     drop column if exists company_cpf,
--     drop column if exists company_address_line,
--     drop column if exists company_address_city,
--     drop column if exists company_address_state,
--     drop column if exists company_address_zip,
--     drop column if exists company_email,
--     drop column if exists company_phone,
--     drop column if exists default_cancellation_notice_days,
--     drop column if exists default_cancellation_penalty_pct;
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Expansão de workspace_settings ────────────────────────────────────────
-- Dados obrigatórios da empresa contratada para gerar contratos válidos.
-- Todos NULLABLE — usuário preenche quando quiser emitir contrato.

alter table public.workspace_settings
  add column if not exists company_legal_name               text,
  add column if not exists company_cnpj                     text,
  add column if not exists company_cpf                      text,
  add column if not exists company_address_line             text,
  add column if not exists company_address_city             text,
  add column if not exists company_address_state            text,
  add column if not exists company_address_zip              text,
  add column if not exists company_email                    text,
  add column if not exists company_phone                    text,
  add column if not exists default_cancellation_notice_days integer,
  add column if not exists default_cancellation_penalty_pct numeric(5,2);

-- 2. Tabela contracts ──────────────────────────────────────────────────────

create table if not exists public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid not null references auth.users(id),

  -- Tipo de contrato (catálogo definido em código — ver contract-types.ts)
  contract_type      text not null,
  -- Título livre (default do tipo, editável)
  title              text not null default 'Contrato sem título',

  -- Origem operacional (opcional — contrato pode nascer standalone)
  origin_kind        text check (origin_kind in ('budget','freelance','order','recurring','standalone')),
  origin_id          uuid,

  -- Cliente vinculado (opcional — pode faltar no início, preenchido depois)
  client_id          uuid references public.clients(id) on delete set null,

  -- Status do documento
  status             text not null default 'draft'
                     check (status in ('draft','generated','reviewed','signed','cancelled')),

  -- Snapshot do documento final (markdown gerado)
  rendered_content   text,

  -- Metadata do contexto usado na geração (valores interpolados, campos
  -- faltantes, overrides do usuário). JSON estruturado para regenerar.
  metadata           jsonb not null default '{}'::jsonb,

  -- Notas internas (não aparecem no contrato)
  notes_internal     text,

  generated_at       timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Índices (performance em filtros comuns)
create index if not exists idx_contracts_workspace
  on public.contracts (workspace_id) where deleted_at is null;

create index if not exists idx_contracts_origin
  on public.contracts (origin_kind, origin_id) where deleted_at is null;

create index if not exists idx_contracts_client
  on public.contracts (client_id) where deleted_at is null;

create index if not exists idx_contracts_status
  on public.contracts (workspace_id, status) where deleted_at is null;

-- 3. RLS ────────────────────────────────────────────────────────────────────

alter table public.contracts enable row level security;

drop policy if exists "contracts_select" on public.contracts;
create policy "contracts_select" on public.contracts
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
    and deleted_at is null
  );

drop policy if exists "contracts_insert" on public.contracts;
create policy "contracts_insert" on public.contracts
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

drop policy if exists "contracts_update" on public.contracts;
create policy "contracts_update" on public.contracts
  for update using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contracts_delete" on public.contracts;
create policy "contracts_delete" on public.contracts
  for delete using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- 4. Trigger updated_at ─────────────────────────────────────────────────────

create or replace function public.contracts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contracts_updated_at on public.contracts;
create trigger trg_contracts_updated_at
  before update on public.contracts
  for each row execute function public.contracts_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Fim da migration. Para verificar:
--   select column_name from information_schema.columns
--   where table_name = 'contracts';
-- ═══════════════════════════════════════════════════════════════════════════
