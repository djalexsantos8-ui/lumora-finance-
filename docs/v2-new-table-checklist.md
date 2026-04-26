# Checklist obrigatório — Nova tabela V2

> Toda tabela nova da V2 (sufixo `_v2` ou nascida no escopo V2) DEVE seguir este checklist
> antes de mesclar pra `main`. Vazamento entre workspaces é incidente LGPD bloqueante.

## ✅ Schema

- [ ] Coluna `workspace_id uuid not null references public.workspaces(id) on delete cascade`
- [ ] Coluna `created_at timestamptz not null default now()`
- [ ] Coluna `updated_at timestamptz not null default now()`
- [ ] Trigger `BEFORE UPDATE` chamando `public.set_updated_at()`
- [ ] Index em `workspace_id` (ou composto começando por workspace_id)
- [ ] PK explícita (`id uuid primary key default gen_random_uuid()` ou natural key)

## 🔒 RLS

- [ ] `alter table public.<tabela> enable row level security;`
- [ ] **4 policies** aplicadas (use `RLS_TEMPLATE` de `src/lib/db/rls-helpers.ts`):
  - [ ] `for select using (workspace_id in (select public.user_workspaces()))`
  - [ ] `for insert with check (workspace_id in (select public.user_workspaces()))`
  - [ ] `for update using ... with check ...`
  - [ ] `for delete using (workspace_id in (select public.user_workspaces()))`
- [ ] `service_role` NÃO é usada em rotas de usuário (só em webhooks/jobs)

## 🧪 Testes

- [ ] Tabela adicionada em `scripts/v2-test/rls-isolation.sql`
  - [ ] Teste 1 (SELECT)
  - [ ] Teste 2 (INSERT cross-workspace bloqueado)
  - [ ] Teste 3 (UPDATE cross-workspace 0 rows)
  - [ ] Teste 4 (DELETE cross-workspace 0 rows)
- [ ] `bash scripts/v2-test/run-rls-tests.sh` retorna EXIT=0

## 📝 Documentação

- [ ] Migration tem comentário no topo explicando: o quê + por quê
- [ ] Tabela documentada em `Cérebro/Projetos/Lumora/V2/08-banco-V1-V2-coexistencia.md` (seção "NOVAS V2")
- [ ] Helper TypeScript correspondente em `src/lib/<dominio>/` se aplicável

## 🚫 Anti-padrões (rejeitar em code review)

- ❌ Tabela V2 sem `workspace_id`
- ❌ RLS desabilitado "temporariamente"
- ❌ Policy `using (true)` em produção
- ❌ Filtro só em código (`select * where workspace_id = ?`) sem RLS
- ❌ `service_role` em rota autenticada de usuário
- ❌ Esquecer `with check` em INSERT/UPDATE (vaza inserção cross-workspace)

## 🔧 Variantes de RLS

| Caso | Helper | Quando usar |
|---|---|---|
| Padrão (todos members R/W) | `RLS_TEMPLATE` | 90% das tabelas V2 |
| Só owner escreve | `RLS_OWNER_ONLY` | Subscriptions, billing, settings críticos |
| Só admin Lumora | `RLS_ADMIN_ONLY` | implementation_tasks, claude_inbox, logs internos |

Veja `src/lib/db/rls-helpers.ts` pra implementação.

## Referência

- [[Cérebro/Projetos/Lumora/V2/09-RLS-workspace-id]]
- [[Cérebro/Projetos/Lumora/V2/08-banco-V1-V2-coexistencia]]
- [[Cérebro/Projetos/Lumora/V2/03-decisoes-travadas]] (decisão #6)
