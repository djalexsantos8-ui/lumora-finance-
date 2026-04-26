-- EPIC-17: Carta de orçamento como entidade separada
alter table public.budgets_v2
  add column if not exists letter_content jsonb,
  add column if not exists letter_text_md text;

create table if not exists public.letter_templates_v2 (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  content jsonb,
  text_md text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_letter_templates_workspace
  on public.letter_templates_v2(workspace_id);

create unique index if not exists idx_letter_templates_default_one
  on public.letter_templates_v2(workspace_id) where is_default = true;

create trigger trg_letter_templates_updated
  before update on public.letter_templates_v2
  for each row execute function public.set_updated_at();

alter table public.letter_templates_v2 enable row level security;

create policy "members can read letter_templates_v2"
  on public.letter_templates_v2 for select
  using (workspace_id in (select public.user_workspaces()));

create policy "members can insert letter_templates_v2"
  on public.letter_templates_v2 for insert
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can update letter_templates_v2"
  on public.letter_templates_v2 for update
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can delete letter_templates_v2"
  on public.letter_templates_v2 for delete
  using (workspace_id in (select public.user_workspaces()));

comment on column public.budgets_v2.letter_text_md is
  'EPIC-17: Texto da carta de orçamento em Markdown. Suporta variáveis {{cliente_nome}}, {{projeto_nome}}, {{validade}}, {{prazo_entrega}}, {{produtora_nome}}.';
comment on column public.budgets_v2.letter_content is
  'EPIC-17: ProseMirror JSON (reservado para iteração futura com Tiptap). Hoje letter_text_md é a source of truth.';
comment on table public.letter_templates_v2 is
  'EPIC-17: Templates de carta reutilizaveis por workspace. is_default carrega automaticamente em novo orcamento.';
