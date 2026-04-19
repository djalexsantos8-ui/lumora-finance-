-- ============================================================
-- MIGRATION 020 — Clients (zero-fricção)
--
-- Cliente NÃO é cadastro obrigatório.
-- Nasce automaticamente a partir de jobs (e, no futuro, orçamentos
-- e contratos) quando o usuário digita um nome que ainda não existe.
--
-- Regras centrais:
--   · UNIQUE (workspace_id, name_normalized) — anti-duplicação
--   · jobs.client_id (nullable) — aponta para o cliente estruturado
--   · jobs.client_name (mantido) — fallback legado + rótulo rápido
--
-- NÃO migramos dados antigos nesta migration. Dados antigos
-- continuam funcionando via client_name (aggregators usam client_name).
-- ============================================================

-- ─── 1. Tabela clients ──────────────────────────────────────────

create table if not exists public.clients (
  id                uuid         primary key default gen_random_uuid(),
  workspace_id      uuid         not null references public.workspaces(id) on delete cascade,
  name              text         not null,
  name_normalized   text         not null,
  phone             text,
  instagram         text,
  email             text,
  document          text,
  notes             text,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  deleted_at        timestamptz,

  constraint clients_name_not_empty check (length(trim(name)) > 0),
  constraint clients_name_normalized_not_empty check (length(name_normalized) > 0)
);

-- Índice único para anti-duplicação (apenas clientes ativos)
create unique index if not exists uq_clients_workspace_normalized
  on public.clients(workspace_id, name_normalized)
  where deleted_at is null;

-- Busca por name_normalized (autocomplete)
create index if not exists idx_clients_workspace_active
  on public.clients(workspace_id)
  where deleted_at is null;

create index if not exists idx_clients_name_normalized_trgm
  on public.clients using gin (name_normalized gin_trgm_ops);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ─── 2. RLS ─────────────────────────────────────────────────────

alter table public.clients enable row level security;

drop policy if exists "clients: workspace members full access" on public.clients;
create policy "clients: workspace members full access"
  on public.clients for all
  using (
    exists (
      select 1
      from   public.workspace_members wm
      where  wm.workspace_id = clients.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1
      from   public.workspace_members wm
      where  wm.workspace_id = clients.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 3. jobs.client_id ──────────────────────────────────────────
--
-- Nullable: cliente continua opcional. client_name segue como
-- fallback — aggregators do dashboard usam client_name direto.

alter table public.jobs
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_jobs_client_id on public.jobs(client_id) where client_id is not null;

-- ─── 4. Extensão pg_trgm (para busca fuzzy no autocomplete) ─────
-- Idempotente: cria só se ainda não existir.

create extension if not exists pg_trgm;
