-- EPIC-11: Paywall direcionado por feature
-- Tabela feature_gates: mapeamento feature -> plano mínimo + copy do paywall
create table if not exists public.feature_gates (
  feature_key   text primary key,
  min_plan      text not null check (min_plan in ('creator', 'enterprise')),
  display_name  text not null,
  description   text not null,
  upgrade_pitch text not null,
  icon          text not null,
  example_image_url text,
  created_at    timestamptz default now()
);

-- Seeds — features premium V2
insert into public.feature_gates (feature_key, min_plan, display_name, description, upgrade_pitch, icon)
values
  ('crm',           'enterprise', 'CRM',           'Funil de vendas com leads, follow-ups e conversão',
                                                    'Veja todos os leads num só lugar — do briefing à assinatura do contrato.', '🎯'),
  ('marketing',     'enterprise', 'Marketing',     'Campanhas, mailing list e automação de follow-up',
                                                    'Mande newsletter pros clientes ativos com 1 clique.', '📣'),
  ('agenda',        'enterprise', 'Agenda',        'Calendário de produções com bloqueio de equipamento',
                                                    'Nunca mais agende uma diária com câmera duplicada.', '📅'),
  ('sua_produtora', 'enterprise', 'Sua Produtora', 'Página pública pra clientes verem orçamentos e portfólio',
                                                    'Cliente abre seu link e vê o que você quer mostrar.', '🎬'),
  ('multi_user',    'enterprise', 'Multi-usuário', 'Adicione mais de 2 pessoas no workspace',
                                                    'Trabalhe em equipe sem dividir login.', '👥')
on conflict (feature_key) do update set
  min_plan      = excluded.min_plan,
  display_name  = excluded.display_name,
  description   = excluded.description,
  upgrade_pitch = excluded.upgrade_pitch,
  icon          = excluded.icon;

alter table public.feature_gates enable row level security;

drop policy if exists "anyone authenticated can read feature_gates" on public.feature_gates;
create policy "anyone authenticated can read feature_gates"
  on public.feature_gates for select
  to authenticated using (true);

comment on table public.feature_gates is
  'EPIC-11: Mapeamento de features -> plano mínimo. Lido pelo paywall direcionado e middleware.';
