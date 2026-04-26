-- V2: Painel de Plano de Implementação
-- Tabela usada SÓ por admin para acompanhar a evolução da V2.
-- Não tem RLS por workspace porque é admin-only (gate na rota).
-- Pensado pra ser simples: tabela + algumas colunas + populada com epics iniciais.
-- Pode evoluir pra Kanban depois sem migration nova (só novas colunas).

create table if not exists public.implementation_tasks (
  id uuid primary key default gen_random_uuid(),
  epic_code text not null,                         -- "EPIC-01", "EPIC-02", ...
  title text not null,
  description_simple text,                          -- explicação não-técnica
  description_technical text,                       -- opcional
  area text not null default 'produto',             -- frontend|backend|database|devops|produto|stripe|ia
  priority text not null default 'P1',              -- P0|P1|P2|P3
  status text not null default 'pending',           -- pending|doing|blocked|validating|done|cancelled
  result text,                                      -- success|failed|partial
  blocker text,                                     -- se status=blocked
  next_step text,                                   -- o que vem depois
  notes text,                                       -- observações livres
  parent_task_id uuid references public.implementation_tasks(id) on delete set null,
  auto_created boolean not null default false,      -- true se criada por erro de outra
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_impl_tasks_status on public.implementation_tasks(status);
create index if not exists idx_impl_tasks_priority on public.implementation_tasks(priority);
create index if not exists idx_impl_tasks_epic on public.implementation_tasks(epic_code);
create index if not exists idx_impl_tasks_parent on public.implementation_tasks(parent_task_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_impl_tasks_updated on public.implementation_tasks;
create trigger trg_impl_tasks_updated
  before update on public.implementation_tasks
  for each row execute function public.set_updated_at();

-- RLS: somente admins (admin_grants ativo) podem ler/escrever
alter table public.implementation_tasks enable row level security;

drop policy if exists "admin can read impl tasks" on public.implementation_tasks;
create policy "admin can read impl tasks"
  on public.implementation_tasks for select
  using (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid() and (expires_at is null or expires_at > now())
    )
  );

drop policy if exists "admin can write impl tasks" on public.implementation_tasks;
create policy "admin can write impl tasks"
  on public.implementation_tasks for all
  using (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid() and (expires_at is null or expires_at > now())
    )
  )
  with check (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid() and (expires_at is null or expires_at > now())
    )
  );

-- Popula tasks iniciais — epics da V2 (42 epics)
-- ORDEM aprovada pelo Leleco em 2026-04-25:
-- 1.Backup 2.Banco 3.RLS 4.Stripe 5.Webhook 6./v2 protegida
-- 7.Workspaces 8.Budget V2 9.IA com créditos 10.Pagas/Limites 11.Dashboard (último)
insert into public.implementation_tasks (epic_code, title, description_simple, area, priority, status, next_step) values

-- ONDA 0 — Fundação (P0 absoluto, sem isso nada anda)
('EPIC-01', 'Backup git completo + tag de segurança', 'Salvei o estado atual do projeto numa "fotografia" (tag git). Se algo der errado nas próximas etapas, dá pra voltar pra esse ponto exato com um comando.', 'devops', 'P0', 'done', 'Branch v2 será criada na próxima'),
('EPIC-02', 'Branch v2 isolada do main', 'Criar uma versão paralela do código onde V2 vai ser construída. A V1 que está rodando para os usuários atuais NÃO é afetada.', 'devops', 'P0', 'pending', 'git checkout -b v2'),
('EPIC-03', 'Aba "Plano de Implementação" no Admin', 'Esta aba aqui que você está vendo. Mostra todas as etapas da V2, status, prioridade, observações. É o painel de controle.', 'frontend', 'P0', 'doing', 'Concluir UI básica'),
('EPIC-04', 'Migration tabela `implementation_tasks` no Supabase', 'A tabela do banco onde estas tasks ficam guardadas. Já criada, com RLS de admin (só você vê).', 'database', 'P0', 'done', 'Aplicar via db:push'),
('EPIC-05', 'Tabelas `workspaces` + `workspace_members` (multi-tenant)', 'Cria o conceito de "espaço de trabalho" — fundação pra V2 ter múltiplos usuários e isolar dados. Cada usuário V1 vira dono de 1 workspace.', 'database', 'P0', 'pending', 'Criar migration'),
('EPIC-06', 'RLS por workspace_id em todas tabelas V2', 'Garante que o usuário do workspace A NUNCA consegue ver dados do workspace B. Teste obrigatório com 2 usuários antes de seguir.', 'database', 'P0', 'pending', 'Após criar workspaces'),

-- ONDA 1 — Stripe (prioridade crítica)
('EPIC-07', 'Produtos Stripe: Creator + Enterprise', 'Criar os 2 planos no Stripe em modo TEST com preços iniciais placeholder (R$ 1). Creator = até 2 usuários, Enterprise = 5 usuários + add-on. Trial 7 dias com cartão obrigatório (decisão travada). Preço final é parâmetro de config, não bloqueia desenvolvimento.', 'stripe', 'P0', 'pending', 'Criar produtos no Stripe TEST'),
('EPIC-08', 'Webhook Stripe — assinaturas + status', 'Quando o cliente pagar, cancelar ou trial expirar, o Stripe avisa o Lumora. O Lumora muda o status do usuário automaticamente.', 'backend', 'P0', 'pending', 'Após criar produtos'),
('EPIC-09', 'Tela de signup com escolha de plano + cartão', 'Na criação da conta, mostrar os planos, deixar o usuário escolher, coletar cartão e iniciar trial.', 'frontend', 'P0', 'pending', 'Após webhook funcionar'),
('EPIC-10', 'Indicador de plano/trial na sidebar', 'Mostrar acima de Configurações: "Plano Creator" ou "Trial — expira em 5 dias" com link de cancelamento.', 'frontend', 'P0', 'pending', 'Após signup integrado'),
('EPIC-11', 'Bloqueio de feature por plano (paywall)', 'Quando o usuário do plano Creator tentar acessar CRM/Marketing/Agenda (Enterprise-only), redirecionar para tela /upgrade?feature=X.', 'backend', 'P0', 'pending', 'Após indicador de plano'),

-- ONDA 2 — Rota /v2 + Budget V2 (coração do produto)
('EPIC-12', 'Rota /v2 protegida por is_admin', 'Criar a área V2 acessível só por admin. Aqui fica todo o código novo sem misturar com V1.', 'frontend', 'P0', 'pending', 'Após Stripe estável'),
('EPIC-13', 'Migration `budgets_v2` + `budget_items_v2` com unit_cost', 'Tabela nova de orçamento que tem campo de Custo separado do Valor ao Cliente. Permite rentabilidade real.', 'database', 'P0', 'pending', 'Após /v2 protegida'),
('EPIC-14', 'Editor de Orçamento V2 com 4 KPIs', 'Editor novo que mostra Custo Base, Valor ao Cliente, Margem Bruta e Markup em tempo real.', 'frontend', 'P0', 'pending', 'Após migration budgets_v2'),
('EPIC-15', 'Rentabilidade por linha + bloco RENTABILIDADE', 'Cada item do orçamento mostra Sobra e %. Bloco lateral mostra Custo Base, Valor cobrado, Lucro, Margem líquida, Markup.', 'frontend', 'P0', 'pending', 'Após editor V2'),
('EPIC-16', '"Encargos do projeto" no PDF cliente', 'No PDF que vai pro cliente, juntar margem + impostos numa linha só (esconde o markup do cliente). Padrão absorvido do Proos com nome próprio.', 'backend', 'P0', 'pending', 'Após rentabilidade visível'),
('EPIC-17', 'Carta de Orçamento como entidade separada', 'Texto comercial editável (saudação, condições, cláusulas) separado dos itens. Reutilizável.', 'frontend', 'P1', 'pending', '—'),
('EPIC-18', 'Histórico de Versões do orçamento', 'Cada vez que clicar "Salvar Versão", congela um snapshot. Permite ver o que foi enviado quando.', 'database', 'P1', 'pending', '—'),

-- ONDA 3 — Cadastros profissionais
('EPIC-19', 'Auto-preenchimento via CNPJ (BrasilAPI)', 'Usuário digita CNPJ → API gratuita devolve nome, razão social, endereço — preenche automático. Reduz drasticamente tempo de cadastro.', 'backend', 'P0', 'pending', '—'),
('EPIC-20', 'Múltiplos contatos por cliente', 'Cliente é a empresa. Contatos são pessoas dentro dela. Cada cliente pode ter N contatos com cargo/email/telefone.', 'database', 'P0', 'pending', '—'),
('EPIC-21', 'Cadastro freelancer audiovisual completo', 'Adicionar campos: Nome Artístico, Instagram, Restrição Alimentar (catering), Tipo (freelancer/equipe fixa).', 'frontend', 'P1', 'pending', '—'),
('EPIC-22', 'Tipos de projeto pré-cadastrados (17 tipos)', 'Combobox com Comercial/Documentário/Casamento/etc. Customizável pelo workspace.', 'database', 'P1', 'pending', '—'),
('EPIC-23', 'Multi-data de filmagem no orçamento', 'Um orçamento pode ter N dias de filmagem em datas diferentes. Cada dia tem local próprio.', 'database', 'P1', 'pending', '—'),

-- ONDA 4 — Financeiro pro
('EPIC-24', 'View `dre_competencia` (DRE Competência)', 'Demonstrativo financeiro que registra a venda no MÊS DA EXECUÇÃO, não do recebimento. Padrão contábil profissional.', 'database', 'P0', 'pending', 'Após budgets_v2'),
('EPIC-25', 'Toggle DRE × Fluxo de Caixa Realizado', 'Botão na tela de financeiro que troca entre as 2 visões. Hoje a Lumora só tem fluxo de caixa.', 'frontend', 'P0', 'pending', 'Após DRE'),
('EPIC-26', 'Margem de Contribuição com fórmula visível', 'KPI calculado e a fórmula aparece em tooltip — educa o usuário enquanto ele opera.', 'frontend', 'P0', 'pending', 'Após DRE'),
('EPIC-27', 'Sub-página /financeiro/projecao (cash forecast)', 'Mostra previsão de entrada/saída futura baseada em orçamentos aprovados e despesas fixas.', 'frontend', 'P1', 'pending', '—'),
('EPIC-28', 'Reconciliação contas bancárias', 'Sub-página que mostra saldo esperado vs real e ajuda a casar transações.', 'frontend', 'P1', 'pending', '—'),

-- ONDA 5 — IA com guardrails
('EPIC-29', 'Sistema de créditos IA (Creator 100 / Enterprise 300)', 'Cada workspace tem cota mensal. Cada uso da IA consome 1 crédito. Reseta no início do ciclo de cobrança.', 'database', 'P0', 'pending', 'Após Stripe'),
('EPIC-30', 'Alerta IA aos 80% de uso', 'Banner amigável: "Você usou 80 de 100 créditos do mês. Restam X dias." + opção de comprar créditos extras.', 'frontend', 'P0', 'pending', 'Após créditos'),
('EPIC-31', 'IA gera itens de orçamento automaticamente', 'Usuário digita "Casamento 1 dia em BH" → IA sugere 5-7 itens com custos médios de mercado. Aproveita gpt-4o-mini.', 'backend', 'P1', 'pending', 'Após créditos'),
('EPIC-32', 'IA explica resultado financeiro (DRE)', '"Sua margem caiu 8% vs mês anterior — principal causa: despesas fixas subiram R$ 2.500".', 'backend', 'P1', 'pending', 'Após DRE'),
('EPIC-33', 'Proposta de Valor IA — formulário guiado', 'Tela com perguntas (múltipla escolha + texto curto/longo). UMA chamada OpenAI no fim gera o documento de proposta de valor da produtora.', 'frontend', 'P1', 'pending', 'Após créditos'),

-- ONDA 6 — Features pagas (Enterprise-only)
('EPIC-34', 'Módulo CRM (Enterprise)', 'Pipeline de leads, oportunidades, follow-ups. Bloqueado no Creator.', 'frontend', 'P1', 'pending', '—'),
('EPIC-35', 'Marketing / Geração de leads (Enterprise)', 'Formulário público pra captar leads, integração email automática. Bloqueado no Creator.', 'frontend', 'P1', 'pending', '—'),
('EPIC-36', 'Agenda (Enterprise)', 'Calendário de jobs com timeline. Bloqueado no Creator.', 'frontend', 'P1', 'pending', '—'),
('EPIC-37', 'Aba "Sua Produtora" (Enterprise)', 'Multi-cliente, multi-projeto, organograma. Bloqueado no Creator.', 'frontend', 'P1', 'pending', '—'),
('EPIC-38', 'Convidar usuário por email', 'Owner do workspace convida usuários (até limite do plano). Email com link de aceite.', 'backend', 'P1', 'pending', 'Após workspace_members'),
('EPIC-39', 'Add-on +1 usuário (Enterprise)', 'Compra de usuário adicional via Stripe (preço a definir).', 'stripe', 'P1', 'pending', 'Após Stripe estável'),

-- ONDA 7 — Quick wins independentes
('EPIC-40', 'Footer copyright dinâmico', 'Substituir "© 2024" por ano corrente automático.', 'frontend', 'P0', 'pending', '—'),
('EPIC-41', 'Trial 14 → 7 dias com cartão (config Stripe + UI)', 'Mudar config Stripe + mensagens da landing. Mostrar pricing já no signup.', 'stripe', 'P0', 'pending', 'Após produtos Stripe'),
('EPIC-42', 'Glossário de copy adaptado (não copiar Proos)', 'Lista de adaptações: "Ajustes operacionais" → "Encargos do projeto", etc. Salvo no Obsidian.', 'produto', 'P1', 'pending', '—'),

-- ONDA 8 — Migração e Dashboard (último)
('EPIC-43', 'Script de migração V1 → V2 (preparado, não executado)', 'Esqueleto de scripts SQL que vão converter dados V1 pro modelo V2 quando V2 estiver pronta. Inclui validação de contagem e rollback.', 'database', 'P0', 'pending', 'Após estrutura V2 estável'),
('EPIC-44', 'Dashboard V2 (último, depende de tudo)', 'Reformular dashboard com KPIs unificados — Ticket Médio, Margem, etc. Por último, depende dos dados V2 estarem populados.', 'frontend', 'P1', 'pending', 'Última onda');
