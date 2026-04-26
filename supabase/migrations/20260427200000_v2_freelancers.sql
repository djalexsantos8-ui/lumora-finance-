-- EPIC-21: Cadastro completo de freelancer audiovisual
create table if not exists public.freelancers_v2 (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- Identidade
  nome_completo text not null,
  nome_artistico text,
  display_name text not null,
  cpf text,
  data_nascimento date,
  foto_url text,

  -- Contato e redes
  email text,
  telefone text,
  whatsapp text,
  instagram text,
  vimeo_url text,
  portfolio_url text,

  -- Funcao
  funcao_principal text not null,
  funcoes_secundarias text[] not null default '{}',
  skills text[] not null default '{}',
  experiencia_anos int,

  -- Tarifa
  tarifa_diaria numeric(10, 2),
  tarifa_hora numeric(10, 2),
  moeda text not null default 'BRL',

  -- Logistica
  cidade text,
  uf text,
  disponibilidade text,
  restricao_alimentar text,
  restricao_alimentar_detalhe text,
  tem_carro boolean not null default false,
  tem_cnh boolean not null default false,

  -- Equipamento
  equipamento_proprio text,
  equipamento_disponivel_para_emprestimo boolean not null default false,

  -- Pagamento
  pix_chave text,
  banco_nome text,
  banco_agencia text,
  banco_conta text,
  banco_tipo text check (banco_tipo in ('corrente', 'poupanca') or banco_tipo is null),

  -- Notas + tags
  notes text,
  rating int check (rating between 1 and 5),
  tags text[] not null default '{}',
  extras jsonb not null default '{}',

  -- Auditoria
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_freelancers_v2_workspace        on public.freelancers_v2(workspace_id);
create index if not exists idx_freelancers_v2_funcao           on public.freelancers_v2(workspace_id, funcao_principal);
create index if not exists idx_freelancers_v2_disponibilidade  on public.freelancers_v2(workspace_id, disponibilidade);
create index if not exists idx_freelancers_v2_skills           on public.freelancers_v2 using gin(skills);
create index if not exists idx_freelancers_v2_tags             on public.freelancers_v2 using gin(tags);

create trigger trg_freelancers_v2_updated
  before update on public.freelancers_v2
  for each row execute function public.set_updated_at();

alter table public.freelancers_v2 enable row level security;

create policy "members can read freelancers_v2"
  on public.freelancers_v2 for select
  using (workspace_id in (select public.user_workspaces()));

create policy "members can insert freelancers_v2"
  on public.freelancers_v2 for insert
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can update freelancers_v2"
  on public.freelancers_v2 for update
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can delete freelancers_v2"
  on public.freelancers_v2 for delete
  using (workspace_id in (select public.user_workspaces()));

comment on table public.freelancers_v2 is
  'EPIC-21: Cadastro rico de freelancer audiovisual (PF). Separado de fornecedores_v2 (PJ).';
