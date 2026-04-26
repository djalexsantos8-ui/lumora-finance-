-- EPIC-18: Histórico de versões do orçamento (snapshots imutáveis)
create table if not exists public.budget_versions_v2 (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets_v2(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number int not null,
  label text,
  snapshot jsonb not null,
  total_value_cents bigint not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (budget_id, version_number)
);

create index if not exists idx_budget_versions_budget
  on public.budget_versions_v2(budget_id, version_number desc);

alter table public.budget_versions_v2 enable row level security;

drop policy if exists "members can read budget_versions_v2" on public.budget_versions_v2;
create policy "members can read budget_versions_v2"
  on public.budget_versions_v2 for select
  using (workspace_id in (select public.user_workspaces()));

drop policy if exists "members can insert budget_versions_v2" on public.budget_versions_v2;
create policy "members can insert budget_versions_v2"
  on public.budget_versions_v2 for insert
  with check (workspace_id in (select public.user_workspaces()));

-- IMUTABILIDADE POR DESIGN: nenhuma policy de UPDATE ou DELETE.

comment on table public.budget_versions_v2 is
  'EPIC-18: snapshot imutavel de orcamento V2. Append-only — sem UPDATE/DELETE policies por design (livro razao contabil).';
