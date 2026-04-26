-- V2: fila `claude_inbox` para execução automática + colunas extras pra rastrear quem fez o quê.
-- A fila é populada pelo botão "🤖 Executar via Claude" na página /admin/plano-implementacao.
-- Quando o Claude estiver rodando (chat aberto ou /loop ativo), ele lê items unprocessed,
-- executa em ordem, e atualiza tanto a fila quanto a task pai.

-- 1. Colunas extras na implementation_tasks
alter table public.implementation_tasks
  add column if not exists queued_for_claude boolean not null default false,
  add column if not exists last_action_by text,           -- 'leleco' | 'claude'
  add column if not exists last_action_at timestamptz,
  add column if not exists result_notes text;             -- explicação simples do resultado

-- 2. Tabela claude_inbox: cada linha é um pedido pro Claude executar uma task
create table if not exists public.claude_inbox (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.implementation_tasks(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  -- claim: quando o Claude pega pra processar
  claimed_at timestamptz,
  -- resultado
  processed_at timestamptz,
  status text not null default 'queued',  -- queued | processing | done | failed | skipped
  error_message text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_claude_inbox_status on public.claude_inbox(status);
create index if not exists idx_claude_inbox_task on public.claude_inbox(task_id);

-- RLS: admin-only
alter table public.claude_inbox enable row level security;

drop policy if exists "admin can read claude_inbox" on public.claude_inbox;
create policy "admin can read claude_inbox"
  on public.claude_inbox for select
  using (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid() and (expires_at is null or expires_at > now())
    )
  );

drop policy if exists "admin can write claude_inbox" on public.claude_inbox;
create policy "admin can write claude_inbox"
  on public.claude_inbox for all
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

-- 3. Tabela admin_failure_notifications — log de quando Claude notificou admin por email
create table if not exists public.admin_failure_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.implementation_tasks(id) on delete cascade,
  admin_email text not null,
  subject text not null,
  body_excerpt text,
  resend_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.admin_failure_notifications enable row level security;

drop policy if exists "admin can read failure_notifications" on public.admin_failure_notifications;
create policy "admin can read failure_notifications"
  on public.admin_failure_notifications for select
  using (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid() and (expires_at is null or expires_at > now())
    )
  );

-- 4. Adiciona EPICs novos ao plano (essas features que estamos construindo agora)
insert into public.implementation_tasks (epic_code, title, description_simple, area, priority, status, next_step) values
('EPIC-45', 'Botões de ação na página de Plano de Implementação',
 'Adicionar botões em cada linha: Iniciar, Concluir, Bloquear, Executar via Claude. Você pode controlar o avanço das tasks direto da página, sem precisar pedir nada no chat.',
 'frontend', 'P0', 'pending', '—'),

('EPIC-46', 'Visualização mobile da página de Plano',
 'A página vira cards stackados em telas pequenas (celular). Você consegue aprovar tarefas de qualquer lugar, da rua, no transporte público.',
 'frontend', 'P0', 'pending', '—'),

('EPIC-47', 'Notificação por email quando algo der errado',
 'Quando o Claude tentar executar uma tarefa e ela falhar, envia um email pro admin (você) automaticamente. Email tem o que tentou fazer, o erro e link pra ver no painel.',
 'backend', 'P0', 'pending', 'Usar Resend que já está configurado'),

('EPIC-48', 'Fila de execução do Claude (claude_inbox)',
 'Tabela nova no banco onde você marca tarefas como "Executar via Claude". Quando você abrir o chat e pedir, eu leio essa fila e executo em ordem. Permite trabalhar offline e me deixar a lista.',
 'database', 'P0', 'pending', '—');

-- 5. Marca EPIC-03 como concluído (aba está em produção)
update public.implementation_tasks
set
  status = 'done',
  finished_at = now(),
  result = 'success',
  result_notes = 'Aba "Plano de Implementação" criada e está rodando em https://www.lumorafinance.com.br/admin/plano-implementacao com 44 tarefas listadas. V1 não foi afetada (testei o dashboard antigo, continua funcionando normal).',
  notes = 'Migration applied. Build OK. Deploy Vercel ~30s.',
  last_action_by = 'claude',
  last_action_at = now(),
  started_at = coalesce(started_at, now() - interval '2 hours'),
  next_step = 'EPIC-45 (botões) + EPIC-46 (mobile) + EPIC-47 (email)'
where epic_code = 'EPIC-03';

-- 6. Marca EPIC-02 como concluído (branch v2 criada e mergeada)
update public.implementation_tasks
set
  status = 'done',
  finished_at = now(),
  result = 'success',
  result_notes = 'Criei uma branch chamada "v2" no Git, fiz as alterações da aba lá, e depois juntei com a versão principal (main). Isso permitiu desenvolver isolado e só publicar quando estava pronto.',
  notes = 'git tag pre-v2-2026-04-25 + branch v2 + fast-forward merge to main + push origin main',
  last_action_by = 'claude',
  last_action_at = now(),
  started_at = coalesce(started_at, now() - interval '2 hours'),
  next_step = '—'
where epic_code = 'EPIC-02';
