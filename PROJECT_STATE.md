# 📌 Projeto: Lumora Finance

> Snapshot técnico consolidado. Documento destinado a onboarding frio de outro agente.
> Data do snapshot: **2026-04-19**
> Branch: `main` · Repo: `github.com/djalexsantos8-ui/lumora-finance-`

---

## 🧠 Visão Geral

Lumora Finance é um **app web de gestão financeira para filmmakers freelancers brasileiros**, posicionado como alternativa estruturada ao Google Sheets. Usuário-alvo: criador de conteúdo/videomaker solo ou pequena produtora que precisa rastrear:

- **Freelances** (projetos pagos): receita, custos, repasses, pagamentos
- **Orçamentos**: propostas comerciais com itens e margem, exportáveis em PDF
- **Clientes**: cadastro leve, nascido automaticamente a partir de freelances/orçamentos
- **Despesas** recorrentes e pontuais
- **Custos fixos**
- **Receita recorrente** (placeholder — futuro MRR/retainer)
- **Dashboard executivo** com narrativa textual (KPIs + insights em linguagem natural)

Billing via Stripe (trial 7 dias sem cartão). Multi-tenant por `workspace_id`. Locale PT-BR, moeda padrão BRL.

---

## 🏗️ Arquitetura Atual

### Stack

| Camada | Tech |
|---|---|
| Framework | **Next.js 16.2.2** (App Router + Turbopack) |
| React | 19.2.4 |
| Styling | Tailwind 4 + CSS-in-className (paleta `#0a0a0a` / `#D4A853` dourado) |
| Backend | **Supabase** (Postgres + Auth + RLS) via `@supabase/ssr` |
| Auth | Supabase Auth (SSR cookies) |
| Billing | Stripe (`stripe` v22) — webhook + checkout |
| Email | Resend (`resend` v6) |
| PDF | `@react-pdf/renderer` v4 |
| Hosting | Vercel (auto-deploy no push pra `main`) |
| Gerenciador | npm (package-lock.json) |

### Estrutura de diretórios (relevante)

```
src/
├── app/
│   ├── (app)/                      # Route group autenticado
│   │   ├── layout.tsx              # Sidebar + auth guard
│   │   ├── dashboard/              # Dashboard executivo (INTOCÁVEL)
│   │   ├── dashboard-antigo/       # Legacy, ainda servido
│   │   ├── freelances/             # ← renomeado de /jobs (Deploy 2)
│   │   │   ├── page.tsx            # Lista
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Server component fetch
│   │   │       └── job-detail.tsx  # Client component (1584 linhas)
│   │   ├── budgets/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   ├── budget-editor.tsx  # Editor principal
│   │   │   │   ├── add-item-modal.tsx
│   │   │   │   └── preview/        # Render HTML do PDF
│   │   │   └── freelancers/        # Sub-cadastro de freelancers de orçamento
│   │   ├── clientes/
│   │   │   ├── page.tsx
│   │   │   └── clientes-client.tsx # Editor inline
│   │   ├── receitas-recorrentes/   # Placeholder (criado nesta sessão)
│   │   ├── contracts/              # Placeholder
│   │   ├── expenses/
│   │   ├── fixed-costs/
│   │   ├── insights/
│   │   │   └── [slug]/
│   │   ├── notifications/
│   │   ├── settings/
│   │   └── upgrade/
│   ├── api/
│   │   ├── auth/callback/
│   │   ├── budgets/[id]/pdf/
│   │   ├── jobs/[id]/pdf/
│   │   ├── cron/notifications/     # Cron Vercel (0 11 * * *)
│   │   ├── exchange-rate/
│   │   └── stripe/{checkout,webhook}/
│   ├── login/, signup/, forgot-password/
│   └── page.tsx                    # Landing
├── components/
│   ├── clients/
│   │   ├── client-combobox.tsx     # Autocomplete
│   │   ├── client-full-form.tsx    # Form completo reutilizável
│   │   └── client-picker.tsx       # Composição canônica (combobox + toggle + form)
│   ├── freelances/
│   │   └── status-stepper.tsx
│   ├── sidebar.tsx
│   └── page-placeholder.tsx
├── lib/
│   ├── actions/                    # Server Actions (`'use server'`)
│   │   ├── budgets.ts
│   │   ├── budget-items.ts
│   │   ├── clients.ts
│   │   ├── jobs.ts                 # updateJob, createJob, etc.
│   │   └── ...
│   ├── dashboard/
│   │   ├── aggregators/            # ⛔ INTOCÁVEL
│   │   └── narrativa/              # ⛔ INTOCÁVEL
│   ├── supabase/
│   │   ├── server.ts
│   │   └── client.ts
│   └── utils/
│       ├── workspace.ts            # getWorkspaceId
│       ├── normalize-name.ts       # normalizeName, cleanName
│       └── format.ts
└── types/
    ├── budget.ts
    ├── client.ts
    ├── job.ts
    └── freelancer.ts
```

### Banco de dados (esquema observado)

| Tabela | Campos-chave | Constraint importante |
|---|---|---|
| `workspaces` | `id`, `owner_id` | — |
| `jobs` ⚠️ | `id`, `workspace_id`, `client_id` (nullable), `client_name` (fallback legado), `status`, `job_date`, `job_date_start`, `job_date_end`, `is_multi_day`, `category`, `revenue_total`, `cost_total`, `currency`, `deleted_at` | — |
| `clients` | `id`, `workspace_id`, `name`, `name_normalized`, `phone`, `instagram`, `email`, `document`, `notes`, `deleted_at` | `UNIQUE (workspace_id, name_normalized)` WHERE `deleted_at IS NULL` |
| `budgets` | `id`, `workspace_id`, `title`, `client_name` (⚠️ **sem `client_id`**), `project_description`, `deliverables`, `event_date`, `valid_until`, `status`, `currency`, `subtotal`, `margin_type`, `margin_input`, `margin_amount`, `total`, `notes_internal`, `sent_at`, `approved_at`, `deleted_at` | — |
| `budget_items` | `id`, `budget_id`, `freelancer_id`, `category`, `custom_category`, `label`, `quantity`, `days`, `unit_value`, `total_value`, `is_custom`, `show_in_pdf`, `sort_order`, `deleted_at` | — |
| `freelancers` | (sub-cadastro por orçamento) | — |
| expenses, fixed_costs, etc. | — | — |

**Nome interno vs produto:** no banco a tabela de projetos continua `jobs` (nunca deve mudar). No produto se fala **"Freelances"**. Adapter é puramente UI/roteamento.

### Estados principais (React/cliente)

#### `job-detail.tsx` (Freelance editor)
- `titleDraft`, `clientDraft`, `editingField: string | null` — campo sendo editado inline
- `clientExtras: ClientFullFormValue` — phone/instagram/email/document/notes
- `expandedClientEdit: boolean` — se o ClientFullForm está expandido
- `isPending` (useTransition) — save em andamento
- `downloadingPdf`, `isDeleting`, `reminderStatus`

#### `budget-editor.tsx`
- `title`, `client`, `desc`, `delivers`, `evtDate`, `validUntil`, `currency`, `notesInt` — campos controlados
- `marginType: 'percentage' | 'fixed'`, `marginInput: string`
- `expandedClientEdit`, `clientExtras`, `clientSaveError` — fluxo do ClientPicker
- `latestFields`, `latestClientExtras`, `expandedClientEditRef` — refs pra auto-save
- `autoSaveTimer` (1500ms debounce)
- `saveState: 'idle' | 'saving' | 'saved' | 'error'`

#### `ClientCombobox`
- `value`, `open`, `items: ClientSearchItem[]`, `highlight: number`
- Debounce 180ms na busca

### Server Actions disponíveis

**`src/lib/actions/clients.ts`**
- `getOrCreateClient(workspaceId, rawName): Client | null` — idempotente, usa UNIQUE + race-safe
- `searchClients(query): ClientSearchResult` — ilike em `name_normalized`
- `listClients(): ClientListResult`
- `updateClient(id, fields): ClientActionResult` — aceita `name`, `phone`, `instagram`, `email`, `document`, `notes`
- `deleteClient(id)` — soft delete

**`src/lib/actions/budgets.ts`**
- `createBudget()` — cria rascunho, redireciona
- `updateBudgetInfo(id, fields): BudgetActionResult` — retorna `{ data, client? }` (client resolvido via getOrCreateClient)
- `updateBudgetMargin(id, type, input)`
- `updateBudgetStatus(id, status)`
- `deleteBudget(id)`
- `recalculateBudgetTotals(budgetId)`

**`src/lib/actions/jobs.ts`** (freelances)
- `updateJob(id, fields)` — chama getOrCreateClient em `client_name` também
- `createJobDraft()`, `deleteJob(id)`

**Regra de retorno:** todas as actions seguem `BudgetActionResult | JobActionResult | ClientActionResult`:
```ts
| { success: true; data?: T; client?: Client }
| { success: false; message: string }
```

### Padrão de captura de cliente (canônico)

Componente único: **`ClientPicker`** (em `src/components/clients/client-picker.tsx`). Compõe:
1. `ClientCombobox` (nome + autocomplete)
2. Botão "+ Adicionar detalhes" / "− Recolher" (toggle)
3. Panel com `ClientFullForm` quando `expanded === true` (nome read-only)

Invariantes enforçadas:
- **Nome = source of truth** (o form renderiza nome em read-only)
- **`resetAnchor` pattern**: quando `name !== resetAnchor` (valor do registro pai, ex: `job.client_name`), zera extras + recolhe form
- **Extras nunca vazam** entre clientes diferentes
- Pai é responsável pelo save encadeado

**Atualmente usado em:** `/budgets/[id]` (via ClientPicker direto).
**Composição manual equivalente:** `/freelances/[id]` (reescreve a composição inline; comportamento igual — legado validado em prod antes do ClientPicker existir).

### Fluxo de save encadeado (soft-fail)

```
1. Usuário clica Salvar / auto-save dispara
2. updateJob({ client_name }) OU updateBudgetInfo({ client_name })
   → servidor chama getOrCreateClient(workspaceId, name)
   → retorna { success, data, client }  // client é o cadastro resolvido
3. Se success E expandedClientEdit E result.client?.id:
   4. updateClient(result.client.id, { phone, instagram, email, document, notes })
   5. Se falhar → clientSaveError = 'Cliente criado, mas não conseguimos salvar
      todos os dados. Você pode completar depois em Clientes.'
      (NÃO desfaz o save do passo 2 — soft-fail)
6. UI atualiza estado local
```

### Deploy & CI

- **Vercel** conectado ao repo GitHub via integração nativa. Push em `main` → build automático → deploy em produção
- `vercel.json` define cron: `/api/cron/notifications` todo dia às 11:00 UTC
- Script local `npm run deploy` (adicionado nesta sessão): `next build && git add -A && (git diff --cached --quiet || git commit -m "deploy: <timestamp>") && git push origin main`
- Preview local via Claude Preview (`.claude/launch.json` tanto em `lumora-finance/.claude/` quanto na CWD da sessão com `--prefix ../lumora-finance`)

---

## 🔄 Fluxos Implementados

### F1. Autenticação
- Supabase Auth SSR. `/login`, `/signup`, `/forgot-password`
- Layout `(app)` guarda contra usuários não autenticados (redirect `/login`)
- `getUser()` em todo server action + `getWorkspaceId(user.id)` para escopo

### F2. Criação de freelance (rascunho direto)
- Botão "Novo Freelance" chama `createJobDraft()` → insere com `title: 'Freelance sem título'`, `job_date: hoje`, `status: in_progress` → redireciona `/freelances/:id`
- `/freelances/new` **foi eliminado** no Deploy 3
- Rascunho identificado por `isDraftFreelance(job)`: `revenue_total === 0 && cost_total === 0 && título default`

### F3. Edição de freelance (inline)
- Campos clicáveis: título, cliente (combobox), categoria, datas, valores
- Status via `StatusStepper` (3 etapas clicáveis: `in_progress → delivered → paid`)
- `cancelled` como ação lateral discreta (não está no stepper)
- Header reestruturado em 3 linhas (stepper / PDF+Excluir / cancelar|reabrir) — ajustado nesta sessão
- Soft-fail: `updateJob` → `updateClient` (quando expanded)

### F4. Sistema de clientes (automático)
- **Zero fricção**: cliente nasce via `getOrCreateClient` quando `client_name` é tocado no freelance/orçamento
- `normalizeName`: trim + lowercase + remove acentos → `name_normalized`
- Constraint `UNIQUE (workspace_id, name_normalized)` garante deduplicação
- `/clientes`: lista + busca client-side + editor expansível inline (nome editável) + soft delete
- Nunca força cadastro manual; o cliente só aparece em `/clientes` depois de ser criado como efeito colateral

### F5. Orçamentos
- Rascunho via `createBudget` → redireciona editor
- Auto-save com debounce 1500ms (latest-ref pattern)
- Itens com categoria (`team`, `food`, `transport`, `accommodation`, `equipment`, `own_work`, `other` + `custom_category`), quantidade, dias, unit_value, total_value, `show_in_pdf`, `sort_order`
- Margem % ou fixa; `recalculateBudgetTotals` recomputa subtotal/margin/total a partir dos itens
- Status: `draft → sent → approved | rejected | expired`, com `sent_at` / `approved_at`
- PDF: `/api/budgets/[id]/pdf` via `@react-pdf/renderer`
- Preview HTML: `/budgets/[id]/preview`
- **ClientPicker integrado** (TAREFA 1 da última sessão): combobox + toggle + expanded form + save encadeado

### F6. Dashboard executivo
- `/dashboard` (o antigo em `/dashboard-antigo`)
- Aggregators em `src/lib/dashboard/aggregators/*` compõem KPIs
- Narrativa em `src/lib/dashboard/narrativa/*` gera texto em linguagem natural por aba
- **⛔ NUNCA MEXER NESTES DIRETÓRIOS** (regra crítica das sessões anteriores)

### F7. Sidebar
Ordem (após reorder nesta sessão):
1. Dashboard
2. Freelances
3. Orçamentos
4. Receita Recorrente (badge "Em breve")
5. Clientes
6. Despesas
7. Custos Fixos
8. Insights
9. Notificações
10. Contratos (badge "Em breve")

### F8. Billing
- Stripe Checkout em `/api/stripe/checkout`
- Webhook em `/api/stripe/webhook`
- Trial 7 dias sem cartão
- Página `/upgrade`

### F9. Notificações
- Cron diário 11:00 UTC chama `/api/cron/notifications`
- Lembretes de pagamento (due/overdue)
- Alert no header do freelance quando `reminderStatus === 'overdue' | 'due_today'`

### F10. PDF do freelance (cobrança)
- `/api/jobs/[id]/pdf` — gera PDF de cobrança e baixa
- Botão "PDF" no header do freelance com estado loading

---

## ⚠️ Problemas Identificados

### PI1. Fluxo de criação de cliente fragmentado (🔥 foco atual)

**Onde:** `/freelances/[id]` (job-detail.tsx) — também aplicável a `/budgets/[id]` via ClientPicker

**Sintoma:** existem **dois pontos de decisão concorrentes pra criar um cliente novo**:
1. Dropdown do `ClientCombobox` mostra "Criar novo cliente: X" quando o nome não existe
2. Botão "+ Adicionar detalhes" abaixo de Salvar/Cancelar abre `ClientFullForm`

**Consequência UX:**
- Usuário não sabe se é pra clicar em um, outro, ou ambos
- "+ Adicionar detalhes" parece desacoplado do momento de criação (parece "editar cliente atual" em vez de "criar completo")
- Criação rápida e criação completa são tratadas como fluxos distintos quando deveriam ser **a mesma intenção com níveis de detalhe diferentes**

**Plano aprovado** (nesta sessão, ainda NÃO implementado):
- Dropdown ganha **duas linhas de criação** quando nome não existe:
  - `+ Criar "X" — só o nome` (fluxo atual, fecha dropdown)
  - `+ Criar "X" — com detalhes` (dispara callback `onCreateWithDetails` → pai seta `expandedClientEdit = true`)
- Botão "+ Adicionar detalhes" **sai** do UI principal
- Save encadeado continua idêntico

### PI2. Duplicação entre `/freelances/[id]` e `ClientPicker`

**Onde:** `job-detail.tsx` não usa `ClientPicker` — reescreve a mesma composição inline (linhas 540-612)

**Por quê não foi migrado:** produção tinha acabado de ser validada quando o `ClientPicker` nasceu; migração seria regressão arriscada. Foi deixado como débito técnico opcional.

**Impacto:** mudanças no padrão de captura de cliente precisam ser aplicadas em DOIS lugares: `ClientCombobox` (centraliza lógica) + `ClientPicker` + `job-detail` (composição manual).

### PI3. `budgets` sem `client_id` (inconsistência de schema)

**Onde:** tabela `budgets` tem só `client_name`, diferente de `jobs` que tem `client_id` + `client_name` fallback.

**Consequência:** no `/budgets/[id]`, pre-popular extras do cliente selecionado exigiria busca por nome (forbidden). Decisão atual: budgets **sempre começam com extras vazios no modo expandido**. Cobre o caso "acabei de digitar o nome, quero adicionar telefone agora", mas não "já salvei, quero rever detalhes do cliente". Para este, usar `/clientes`.

**Regra:** **não mexer no schema** (decisão firmada em sessão anterior).

### PI4. `/dashboard-antigo` ainda servido

**Onde:** rota `/dashboard-antigo` continua no build.

**Risco:** pode ser indexada/acessada por engano. Não há redirect.

### PI5. Arquivo `RELATORIO_TECNICO.md` untracked na raiz

Gerado em sessão anterior, não commitado. Pode ser stale — não foi revisado nesta sessão.

### PI6. Mudanças desta sessão não commitadas

Modificados ou criados (ver `git status -s`):
- `M  package.json` (script `deploy`)
- `M  src/app/(app)/budgets/[id]/budget-editor.tsx` (ClientPicker integration)
- `M  src/app/(app)/freelances/[id]/job-detail.tsx` (header 3-linhas + botão "+ Adicionar detalhes" melhorado)
- `M  src/components/sidebar.tsx` (reorder + Receita Recorrente)
- `M  src/lib/actions/budgets.ts` (getOrCreateClient + retorno client)
- `M  src/types/budget.ts` (BudgetActionResult.client)
- `?? src/app/(app)/receitas-recorrentes/` (placeholder page)
- `?? src/components/clients/client-picker.tsx` (componente canônico)
- `?? RELATORIO_TECNICO.md` (pré-existente, untracked)

**Nada foi pusshed.** Produção continua na versão `9993fa1 feat(clients): modo expandido dentro do freelance (ficha completa)`.

---

## 🧩 Decisões Técnicas Já Tomadas

### DT1. Schema é intocável
- Tabela `jobs` continua `jobs` (só UI chama "Freelances")
- `jobs.job_date`, `job_date_start`, `job_date_end`, `is_multi_day` permanecem
- `budgets` não ganha `client_id` (use `client_name` + `getOrCreateClient` na action)

### DT2. Dashboard é intocável
- `src/lib/dashboard/aggregators/*` e `src/lib/dashboard/narrativa/*` nunca são modificados
- Qualquer refactor deve preservar compatibilidade com o que esses módulos consomem de `jobs`, `budgets`, `expenses`, etc.

### DT3. Cliente nasce automaticamente
- Nenhuma tela exige criação manual de cliente
- `getOrCreateClient` é a única porta de entrada (idempotente + race-safe via UNIQUE + retry)
- `/clientes` é read/update only — nasce vazia pra novos workspaces

### DT4. `ClientPicker` é o padrão canônico
- Toda tela NOVA que capture cliente deve usar `<ClientPicker>` (não `<input>` livre, não modal, não nada customizado)
- Reset automático via `resetAnchor` prop é invariante do padrão

### DT5. Save encadeado soft-fail
- `updateJob` / `updateBudgetInfo` retornam `client` resolvido
- `updateClient` do chain só roda se `expandedClientEdit === true`
- Falha do `updateClient` NUNCA desfaz o save principal
- Mensagem padrão: *"Cliente criado, mas não conseguimos salvar todos os dados. Você pode completar depois em Clientes."*

### DT6. Nome = source of truth
- No `ClientFullForm` o nome é read-only quando `nameReadOnly={true}` (caso do modo expandido)
- Em `/clientes` o nome é editável (renomear cliente recalcula `name_normalized`)

### DT7. `(app)` route group como fronteira de auth
- Tudo dentro de `src/app/(app)/` roda com user logado + sidebar + layout
- `layout.tsx` do grupo faz o guard

### DT8. Deploy via push em `main`
- Vercel GitHub integration faz o resto
- `npm run deploy` é o atalho local (build + commit + push)

### DT9. Decisões da fase de reestruturação (ciclo anterior, validado em prod)
- F.1 Criação de freelance = rascunho direto (aprovado)
- F.2 Rotas `/jobs` → `/freelances` (aprovado e executado)
- F.3 Schema não mexido (aprovado)
- F.4 Cliente inline = só nome via combobox + criação automática, **sem drawer** (aprovado)
- F.5 Status = stepper 3 etapas + cancelled lateral (aprovado)
- F.6 Datas lado a lado (aprovado)
- F.7 Rascunhos = badge "rascunho", sem limpeza automática (aprovado)

---

## ✅ O que já está implementado

### Infraestrutura
- [x] Next.js 16 + App Router + Turbopack
- [x] Supabase Auth SSR + RLS
- [x] Multi-tenant por `workspace_id`
- [x] Stripe checkout + webhook + trial sem cartão
- [x] Resend para email
- [x] Vercel auto-deploy em `main`
- [x] Cron diário `/api/cron/notifications`
- [x] Script local `npm run deploy` (build + commit + push)
- [x] Claude Preview configurado via `.claude/launch.json` (CWD + subfolder)

### Dashboard
- [x] Dashboard executivo V1 em produção (aggregators + narrativa)
- [x] Dashboard antigo em `/dashboard-antigo` (legacy)

### Freelances
- [x] Rotas `/freelances` e `/freelances/[id]` (renomeadas de `/jobs`)
- [x] Criação via rascunho direto (sem `/new`)
- [x] `StatusStepper` (in_progress / delivered / paid)
- [x] Ação lateral: cancelar / reabrir freelance
- [x] Edição inline (título, cliente, categoria, datas, valores)
- [x] Header reestruturado em 3 linhas (status / PDF+Excluir / cancelar|reabrir) — **esta sessão**
- [x] PDF de cobrança via `/api/jobs/[id]/pdf`
- [x] Alert de cobrança atrasada/vencendo
- [x] Soft-fail chained save (`updateJob` → `updateClient`)
- [x] Modo expandido de cliente (combobox + "+ Adicionar detalhes" + ClientFullForm) — **composição manual inline, não usa ClientPicker**
- [x] Botão "+ Adicionar detalhes" com affordance melhorada — **esta sessão** (text-sm + ícone dourado + sem disable condicional)

### Orçamentos
- [x] Rotas `/budgets`, `/budgets/[id]`, `/budgets/[id]/preview`, `/budgets/freelancers`
- [x] Editor com auto-save (debounce 1500ms, latest-ref)
- [x] Itens com categoria, quantidade, dias, unit/total, `show_in_pdf`, `sort_order`
- [x] Margem % ou fixa
- [x] Recálculo automático de subtotal/margin/total
- [x] Status draft → sent → approved/rejected/expired + timestamps
- [x] Export PDF via `@react-pdf/renderer`
- [x] Preview HTML
- [x] **ClientPicker integrado** com save encadeado — **esta sessão**
- [x] Mensagem amarela discreta em caso de falha do save do cliente

### Clientes
- [x] Migration da tabela `clients` aplicada em produção
- [x] `getOrCreateClient` idempotente + race-safe
- [x] `searchClients` para autocomplete
- [x] `listClients` para aba
- [x] `updateClient` (rename + extras)
- [x] `deleteClient` (soft)
- [x] Página `/clientes` com busca + editor inline expansível
- [x] `ClientCombobox` (debounce 180ms, keyboard nav, "Criar novo cliente: X" quando não existe)
- [x] `ClientFullForm` reutilizável (controlled + modo `nameReadOnly`)
- [x] `ClientPicker` componente canônico — **esta sessão**

### Outras telas
- [x] `/expenses`
- [x] `/fixed-costs`
- [x] `/insights` + `/insights/[slug]`
- [x] `/notifications`
- [x] `/settings`
- [x] `/upgrade`
- [x] `/contracts` (placeholder)
- [x] `/receitas-recorrentes` (placeholder, **esta sessão**)
- [x] Sidebar reordenada — **esta sessão**

---

## 🚧 O que falta implementar

### 🔥 Imediato (foco da próxima iteração)

- [ ] **PI1 — Unificar criação de cliente no dropdown**
  - [ ] Adicionar prop `onCreateWithDetails?: (name: string) => void` ao `ClientCombobox`
  - [ ] Quando `showCreateOption === true` e callback fornecido, renderizar 2 linhas (rápido / com detalhes) em vez de 1
  - [ ] Ao clicar "com detalhes": setar valor + disparar callback + fechar dropdown
  - [ ] Manter retrocompatibilidade: sem callback, comportamento antigo (1 linha "Criar novo cliente: X")
  - [ ] Atualizar `ClientPicker` pra passar callback = `() => onExpandedChange(true)`
  - [ ] **Remover** botão "+ Adicionar detalhes" standalone de `ClientPicker` e de `job-detail.tsx` (manter "− Recolher" dentro do panel expandido)
  - [ ] Validar: `tsc --noEmit`, `next build`, testar no dev server em `/freelances/[id]` e `/budgets/[id]`
  - [ ] Commit + push (dispara deploy)

### Débitos técnicos conhecidos

- [ ] **PI2 — Migrar `job-detail.tsx` para usar `ClientPicker`** (remove ~60 linhas de composição manual)
- [ ] **PI4 — Remover ou adicionar redirect 301 em `/dashboard-antigo`**
- [ ] **PI5 — Revisar e decidir destino de `RELATORIO_TECNICO.md`** (deletar ou commitar com propósito claro)
- [ ] **PI6 — Commit e push das mudanças pendentes da sessão** (7 arquivos modificados + 2 novos)

### Features futuras (roadmap — não imediato)

- [ ] `/receitas-recorrentes` — implementação real (CRUD, MRR, integração com dashboard)
- [ ] `/contracts` — geração automática a partir do orçamento
- [ ] Histórico de jobs dentro do editor de cliente em `/clientes` (placeholder existe)
- [ ] Drawer de edição completa de cliente dentro de freelances (**decidido NÃO fazer agora** — DT F.4)
- [ ] Migração de dados antigos de clientes (**decidido NÃO fazer agora** — Fase 7 do plano de clientes)

---

## 🎯 Etapa Atual

**Estamos no passo de refinamento final da UX de captura de cliente dentro do Freelance (e, por consequência, do Orçamento).**

### O que já aconteceu nesta sessão
1. ✅ Padronização do padrão de cliente em todo o sistema (ClientPicker criado)
2. ✅ Integração do ClientPicker no editor de orçamentos (com save encadeado + auto-save)
3. ✅ Sidebar reordenada com Receita Recorrente
4. ✅ Placeholder `/receitas-recorrentes` criado
5. ✅ Header do freelance reestruturado em 3 linhas
6. ✅ Botão "+ Adicionar detalhes" com affordance melhorada (text-sm + ícone dourado + sem disable condicional)
7. ✅ `npm run deploy` adicionado
8. ✅ Claude Preview corrigido (launch.json na CWD da sessão com `--prefix ../lumora-finance`)
9. ✅ Plano de unificação do fluxo de criação de cliente **aprovado e documentado** (PI1)

### O que está bloqueando agora
**Nenhuma implementação da PI1 foi iniciada**. A mudança visual do botão "+ Adicionar detalhes" (passo 6 acima) foi um paliativo imediato — o plano estrutural (unificar no dropdown) está aprovado mas aguardando próxima ordem de execução.

### Próxima ação concreta
Implementar a PI1 conforme plano aprovado:
1. Editar `src/components/clients/client-combobox.tsx` — tipo `Option` ganha variante `'create-full'`, nova prop `onCreateWithDetails`
2. Editar `src/components/clients/client-picker.tsx` — passar callback + remover toggle standalone
3. Editar `src/app/(app)/freelances/[id]/job-detail.tsx` — passar callback no ClientCombobox + remover bloco do botão "+ Adicionar detalhes" (linhas 581-594 do estado pós-sessão)
4. Rodar `npx tsc --noEmit` + `npm run build`
5. Testar no dev server (http://localhost:3000) em `/freelances/[id]` e `/budgets/[id]`
6. Se tudo OK: `npm run deploy`

### Estado do ambiente
- **Dev server:** rodando (`preview_start` ativo, `http://localhost:3000`)
- **Build local:** última verificada = ✅ compilou + 23 rotas geradas
- **Produção:** defasada por 8 commits locais pending (último push = `9993fa1`)
- **Branch:** `main` (trabalhando direto em main; sem feature branch)
