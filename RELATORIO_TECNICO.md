# Relatório Técnico — Lumora Finance

**Data de geração:** 08/04/2026
**Versão do projeto:** 0.1.0 (pré-lançamento)
**Branch analisada:** `main`
**Base:** Análise estática de 67 arquivos `.ts/.tsx` + 19 migrations SQL

---

## 1. Resumo Executivo

### O que o sistema faz

Lumora Finance é uma plataforma web de gestão financeira para freelancers e pequenos estúdios audiovisuais. O sistema permite controlar jobs (trabalhos), orçamentos para clientes, despesas variáveis e custos fixos recorrentes — tudo com suporte a multimoeda, parcelamento e relatórios visuais.

### Quem é o usuário-alvo

**Filmmaker/videomaker freelancer brasileiro**, com as seguintes características:
- Opera sozinho ou com equipe pequena
- Cobra por job (casamento, corporativo, social, documentário)
- Usa Google Sheets hoje para controlar suas finanças
- Não tem formação técnica em finanças
- Precisa de visão clara de quanto vai receber, quanto deve e quanto gastou

### Objetivo principal do produto

Substituir Google Sheets por um sistema opinionado, visual e integrado que responda perguntas como: *"Quanto vou receber este mês? Qual job ainda não foi pago? Quando vence minha próxima assinatura?"*

### Estado atual geral

O projeto está em **fase de MVP funcional com dívidas técnicas acumuladas**. A estrutura de dados é sólida e a base de código é aproveítavel, mas há problemas de qualidade e consistência que precisam ser resolvidos antes de um lançamento público. A prioridade imediata deve ser estabilização, não novas features.

---

## 2. Arquitetura Atual

### Estrutura do frontend

O frontend é construído com **Next.js 16 (App Router)** usando o padrão de separação entre Server Components e Client Components:

```
/src/app
├── /(app)           → Rotas autenticadas (layout com proteção de sessão)
│   ├── dashboard/   → KPIs, gráficos, alertas
│   ├── jobs/        → Gestão de jobs e pagamentos
│   ├── budgets/     → Criação e envio de orçamentos
│   ├── expenses/    → Despesas variáveis
│   ├── fixed-costs/ → Custos fixos recorrentes e parcelados
│   ├── notifications/ → Alertas de vencimento
│   ├── insights/    → Análises (parcialmente implementado)
│   ├── contracts/   → Placeholder (Em breve)
│   ├── settings/    → Configurações do workspace
│   └── upgrade/     → Plano de assinatura
├── /(auth)          → Login, cadastro, recuperação de senha
└── /api             → Route Handlers (Stripe, cron, PDFs, câmbio)
```

**Padrão de componentes:**
- `page.tsx` é sempre Server Component — busca dados no servidor
- `*-client.tsx` é Client Component — gerencia estado local e interatividade
- O dado vai do servidor para o cliente via props, sem fetch client-side

### Estrutura do backend

O backend é **serverless** — não há servidor dedicado. As operações de banco são executadas diretamente em **Server Actions** (funções assíncronas que rodam no servidor sob demanda):

```
/src/lib
├── /actions        → 8 arquivos de Server Actions (~50 funções exportadas)
├── /supabase       → Clients de Supabase (server, client, admin)
├── /dashboard      → Agregação de dados (getDashboardData.ts)
├── /pdf            → Geração de documentos PDF
├── /utils          → Utilitários de formatação
└── /stripe         → Integração com Stripe
```

**Banco de dados:** Supabase (PostgreSQL gerenciado)
**Auth:** Supabase Auth (magic link / email+senha)
**Storage:** Supabase Storage (logos de workspace)

### Fluxo de dados

```
Usuário interage com Client Component
       ↓
Chama Server Action (via form action ou await direto)
       ↓
Server Action autentica (auth.getUser), resolve workspace_id
       ↓
Query direta ao PostgreSQL via Supabase SDK (sem ORM)
       ↓
Retorna { success: true, data } ou { success: false, error }
       ↓
Client Component atualiza estado local (optimistic update)
       ↓
Server Action chama revalidatePath() — Next.js invalida cache da rota
```

### Gerenciamento de estado

Não há gerenciamento de estado global (sem Redux, Zustand, Jotai). O estado vive localmente em cada Client Component via `useState` e `useTransition`. Operações são **otimistas**: o estado local é atualizado imediatamente, e a confirmação vem do servidor.

### Integrações e dependências relevantes

| Integração | Propósito | Status |
|------------|-----------|--------|
| Supabase (PostgreSQL + Auth + Storage) | Core da aplicação | ✅ Ativo |
| Stripe | Assinaturas e billing | ✅ Configurado |
| Resend | Email transacional | ⚠️ Instalado, requer `RESEND_API_KEY` |
| Vercel Cron | Notificações diárias (8h) | ⚠️ Configurado, requer deploy |
| `@react-pdf/renderer` | Geração de PDFs de jobs e orçamentos | ✅ Ativo |

**Dependências notáveis ausentes:** Não há ORM (Prisma/Drizzle), sem biblioteca de forms (React Hook Form/Zod), sem framework de testes, sem logger centralizado.

### Observações arquiteturais importantes

1. **Sem ORM** — Queries escritas manualmente via Supabase SDK. Gera liberdade mas aumenta risco de inconsistência entre camadas.
2. **RLS (Row Level Security)** — Toda regra de acesso multi-tenant está no banco. Se uma query esquece o filtro de workspace, o banco bloqueia — exceto soft delete, que precisa de `.is('deleted_at', null)` manual em cada query.
3. **Soft delete universal** — Nenhum dado é deletado fisicamente. Todo registro tem `deleted_at`. Ausência de um filtro global expõe risco de dados deletados reaparecendo.
4. **Triggers de banco** — `recalculate_job_amount_paid()` mantém `jobs.amount_paid` sempre atualizado via trigger automático. Boa prática, mas aumenta opacidade para quem lê só o código TS.

---

## 3. O que Já Foi Implementado

### Funcionalidades prontas

| Módulo | Funcionalidade |
|--------|---------------|
| **Auth** | Login, cadastro, recuperação de senha via Supabase |
| **Workspace** | Criação automática de workspace no primeiro login, multi-tenant via RLS |
| **Jobs** | CRUD completo, status, categorias, datas, multimoeda |
| **Jobs — Financeiro** | Itens de receita e custo por job, pagamentos recebidos, trigger de recálculo automático |
| **Jobs — Analytics** | Campos de período (início/fim), lead source, segmento de cliente |
| **Orçamentos** | Criação, edição inline, cálculo de margem (% ou fixo), status (draft → sent → approved) |
| **Orçamentos — PDF** | Geração de PDF via React-PDF com dados do workspace (logo, assinatura) |
| **Freelancers** | Cadastro de colaboradores com cargo e daily rate, vinculados a itens de orçamento |
| **Despesas** | CRUD, categorias, parcelamento, multimoeda com IOF, pagamento/desfazer |
| **Custos fixos** | Recorrentes mensais, parcelados, ativar/desativar, encerrar, multimoeda |
| **Custos fixos — Pagamento** | "Pagar mês", "Pagar parcela", "Desfazer" pagamento, undo de parcela |
| **Custos fixos — Edição** | Modal de edição com histórico de alterações em `fixed_cost_history` |
| **Dashboard** | KPIs (faturamento, ticket médio, receita líquida, margem), gráfico de área (SVG), donut chart, tabela de performance |
| **Dashboard — Alertas** | Alertas de jobs com pagamento atrasado ou vencendo (buildPaymentReminders) |
| **Notificações** | Página dedicada com alertas de custos fixos + jobs, separados por urgência |
| **Email** | Rota de cron para envio de digest diário via Resend |
| **Configurações** | Nome/logo da empresa, assinatura, rodapé de PDF |
| **Billing** | Integração Stripe: checkout, webhook, tabela de subscriptions, coupons, affiliates |
| **Sidebar** | Navegação colapsável com tooltip |

### Funcionalidades parcialmente prontas

| Módulo | Situação |
|--------|---------|
| **Dashboard — Filtros** | Pills de período visíveis na UI, mas lógica de filtro não implementada (UI only) |
| **Insights** | Rota existe (`/insights`), geração automática no servidor, mas página cliente não completamente polida |
| **Email de notificações** | Rota existe e código está correto, mas requer `RESEND_API_KEY` configurada no Vercel para funcionar |
| **Coupons/Afiliados** | Estrutura de banco completa (`coupon_codes`, `coupon_usages`, `affiliates`), mas sem UI de gestão |
| **Multi-seat workspace** | Estrutura de banco pronta (`workspace_members` com roles), mas UI de convite de membros não existe |

### Fluxos visuais já montados

- Dashboard: 3 abas (Visão Geral, Comercial, Financeiro) com gráficos SVG sem dependências externas
- Jobs: lista com filtros de status, detalhe com items de receita/custo editáveis inline
- Orçamentos: editor com linha de itens, preview de PDF
- Custos fixos: separação visual entre recorrentes e parcelados, barra de progresso de parcelas

### Lógicas já existentes

- `buildPaymentReminders()` — Gera alertas de cobrança em memória a partir de jobs
- `calcJobFinancials()` — Calcula receita, custo, lucro e margem por job
- `buildFixedCostAlerts()` — Gera alertas de vencimento de custos fixos (dias restantes)
- `getDashboardData()` — Agrega todos os dados do dashboard em uma única chamada ao servidor
- IOF automático em despesas/custos com moeda estrangeira

---

## 4. Bugs e Problemas Identificados

---

### BUG-01 — `client_email.trim()` sem guard pode causar TypeError em runtime

**Onde acontece:** `src/lib/actions/jobs.ts` — função `updateJob()`

**Sintoma:** Crash silencioso no servidor ao atualizar job sem email informado

**Código problemático:**
```typescript
payload.client_email = fields.client_email.trim() || null
// Se fields.client_email for undefined → TypeError: Cannot read properties of undefined (reading 'trim')
```

**Impacto:** Atualização de job falha com erro 500 quando `client_email` não é enviado

**Possível causa:** Campo opcional não protegido com optional chaining

**Correção:** `payload.client_email = fields.client_email?.trim() || null`

**Severidade:** Média

---

### BUG-02 — `exchange_rate: 0` aceito silenciosamente, `amount_brl` fica `null`

**Onde acontece:** `src/lib/actions/expenses.ts` — função `createExpense()`

**Sintoma:** Despesa criada com taxa de câmbio 0 não armazena `amount_brl`, mas não retorna erro

**Código problemático:**
```typescript
const rate = fields.exchange_rate ?? null
if (!rate) return { amount_brl: null, iof_amount: null }
// rate = 0 é falsy → retorna null sem avisar
```

**Impacto:** Relatório financeiro em BRL fica incorreto para despesas em moeda estrangeira

**Possível causa:** Uso de `!rate` ao invés de `rate === null || rate === undefined`

**Correção:** Validar explicitamente `if (rate == null || rate <= 0)`

**Severidade:** Média

---

### BUG-03 — Parsing de `start_date` sem validação de formato pode retornar `NaN`

**Onde acontece:** `src/lib/actions/fixed-costs.ts` — função `createRecurringCost()`

**Sintoma:** `billing_day` fica `NaN` se `start_date` chegar em formato diferente de `YYYY-MM-DD`

**Código problemático:**
```typescript
const billingDay = fields.start_date
  ? parseInt(fields.start_date.split('-')[2], 10)
  : 1
// Se start_date = "08/04/2026" → split('-')[2] = undefined → parseInt(undefined) = NaN
```

**Impacto:** Custo criado com `billing_day = NaN`, exibição incorreta, possível erro de DB (CONSTRAINT verifica 1-31)

**Possível causa:** Confiança no formato do input sem validação

**Correção:** Validar formato ISO antes do parse

**Severidade:** Média

---

### BUG-04 — `console.log()` com payload completo em produção

**Onde acontece:** `src/lib/actions/fixed-costs.ts`, linha 76

**Sintoma:** Toda criação de custo recorrente loga o payload completo (incluindo valores, categorias) nos logs da Vercel

**Código problemático:**
```typescript
console.log('[fixed-costs/create-recurring] payload:', JSON.stringify(payload))
```

**Impacto:** Logs poluídos, informação financeira do usuário exposta em logs de infraestrutura

**Possível causa:** Debug esquecido em código

**Correção:** Remover ou usar `process.env.NODE_ENV === 'development' && console.log(...)`

**Severidade:** Média

---

### BUG-05 — Tipo `any` em handler de webhook Stripe

**Onde acontece:** `src/app/api/stripe/webhook/route.ts`

**Sintoma:** Supabase client tipado como `any` — TypeScript não valida as queries nesse contexto

**Código problemático:**
```typescript
async function handleSubscriptionChange(
  supabase: any,  // ← perde toda verificação de tipo
  subscription: Stripe.Subscription
)
```

**Impacto:** Erros de queries no webhook passam em compilação mas falham em runtime; webhooks silenciosamente errados

**Possível causa:** Dificuldade de tipagem do Supabase Admin Client

**Correção:** Importar e usar `SupabaseClient` do `@supabase/supabase-js`

**Severidade:** Média

---

### BUG-06 — Filtro de soft delete ausente em algumas queries de GET

**Onde acontece:** Múltiplos arquivos de Server Actions

**Sintoma:** Registros deletados logicamente podem aparecer em listagens se a query não inclui `.is('deleted_at', null)`

**Impacto:** Dados "deletados" reaparecem para o usuário em cenários de edge case

**Possível causa:** Não há filtro automático de soft delete — cada query precisa incluir manualmente

**Correção:** Criar wrapper de Supabase que aplica filtro automático, ou adicionar `.is('deleted_at', null)` a toda query de SELECT

**Severidade:** Baixa (RLS bloqueia cross-workspace, mas risco intra-workspace existe)

---

### BUG-07 — Validação de moeda aceita strings inválidas

**Onde acontece:** Todos os Server Actions que aceitam `currency`

**Sintoma:** Valores como `"XYZ"` ou `""` são aceitos sem erro; `formatCurrency()` usa fallback sem aviso

**Código problemático:**
```typescript
const currency = fields.currency ?? 'BRL'  // Sem validação
// Em format.ts:
try {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
} catch {
  return `${currency} ${value.toFixed(2)}`  // Fallback silencioso
}
```

**Impacto:** Relatórios financeiros exibem moedas incorretas sem erro visível

**Severidade:** Baixa

---

### BUG-08 — Dashboard: filtros de período são visuais apenas (sem função)

**Onde acontece:** `src/app/(app)/dashboard/dashboard-client.tsx` — pills de filtro no header

**Sintoma:** Botões "Este mês", "Últimos 3 meses", etc. não alteram os dados exibidos

**Impacto:** Usuário pode clicar e não perceber que nada muda — UX enganosa

**Possível causa:** Feature incompleta — UI entregue antes da lógica

**Severidade:** Baixa (até que seja comunicada como feature ao usuário)

---

## 5. Inconsistências e Dívida Técnica

### DT-01 — `getWorkspaceId()` duplicada em 5 arquivos

A mesma função utilitária está copiada em `jobs.ts`, `expenses.ts`, `fixed-costs.ts`, `freelancers.ts`, `budgets.ts`:

```typescript
async function getWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}
```

**Risco:** Uma mudança na lógica (ex: adicionar verificação de plano ativo) precisa ser replicada em 5 lugares. Já existe pelo menos uma divergência potencial.
**Solução:** Extrair para `src/lib/utils/workspace.ts` e importar em todos.

---

### DT-02 — Tipos de retorno de Server Actions inconsistentes

`createExpense` retorna `ExpenseActionResult & { installments?: Expense[] }` — uma interseção que não é type-safe em contextos de erro:

```typescript
// Se success: false, installments pode ser undefined mas o tipo não comunica isso claramente
```

Outros actions usam o padrão correto:
```typescript
type ActionResult = { success: true; data: T } | { success: false; error: string }
```

**Risco:** Código cliente precisa de type guards adicionais.

---

### DT-03 — Sem `next.config.ts` configurado

O arquivo existe mas está completamente vazio:
```typescript
const nextConfig: NextConfig = {
  /* config options here */
};
```

Configurações faltando:
- `images.remotePatterns` → Carregamento de logos do Supabase Storage
- `headers` → CSP (Content Security Policy), proteção básica
- `output: 'standalone'` → Otimização para deploy em containers (se necessário)

---

### DT-04 — Sem nenhum teste automatizado

Não há arquivos de teste (`*.test.ts`, `*.spec.ts`), sem Jest/Vitest configurado. Toda validação é manual.

**Funções críticas sem teste:**
- `calcJobFinancials()` — Cálculos financeiros do core do produto
- `buildPaymentReminders()` — Lógica de alertas
- `createInstallmentCost()` — Criação atômica de N parcelas
- `buildEmailHtml()` — Template de email

**Risco:** Regressão silenciosa ao modificar lógica financeira.

---

### DT-05 — Sem logger centralizado

Todo log usa `console.error()` / `console.log()` direto, sem estrutura:
```typescript
console.error('[fixed-costs/create]', error)
```

**Problemas:**
- Sem correlação de request ID
- Sem separação por severity em produção
- Sem integração com Sentry/Datadog para alertas de erro em produção

---

### DT-06 — `window.confirm()` para ações destrutivas

Em múltiplos Client Components:
```typescript
if (!window.confirm('Excluir este custo fixo?')) return
```

**Problemas:**
- `window.confirm()` é bloqueante e feia na UI
- Não funciona em mobile WebView em alguns casos
- Sem UX de confirmação visual integrada ao design system

---

### DT-07 — Hardcoded values espalhados pelo código

Valores que deveriam estar em configuração central:
- `'BRL'` como moeda padrão — em 12+ lugares
- `'pt-BR'` como locale — fixo em `formatCurrency()`
- `'America/Sao_Paulo'` — não mencionado em nenhum lugar (TZ bug latente)
- Cores do design system (`#0a0a0a`, `#D4A853`, `#525252`) — hardcoded em cada componente

---

### DT-08 — Migration 017 semanticamente incorreta

O arquivo `017_inspect_fixed_costs_schema.sql` é uma query de inspeção de schema (`SELECT column_name FROM information_schema.columns`), não uma migration de alteração. Não causa erro, mas polui o histórico de migrations com um artefato de debug.

---

### DT-09 — Sem validação de schema na fronteira

Não há Zod ou yup validando dados na entrada dos Server Actions. A validação é feita via `if (!fields.description.trim())`, mas:
- Não valida tipos (ex: string onde número é esperado)
- Não valida tamanho máximo
- Não valida formato de datas
- Erros de banco chegam ao usuário como mensagem raw do PostgreSQL em alguns casos

---

### DT-10 — `window.location.reload()` como solução de sincronização

Em `fixed-costs-client.tsx`:
```typescript
if (res.success) {
  showToast('success', `${parsedN} parcelas lançadas com sucesso!`)
  resetForm()
  window.location.reload()  // Hard reload após criar parcelado
}
```

**Problema:** Full page reload é abrupto e perde estado de UI. Poderia usar `router.refresh()` do Next.js para re-fetch server-side.

---

## 6. Histórico Implícito de Implementação

Com base na estrutura das migrations e padrões de código, é possível reconstituir a trajetória do projeto:

### Fase 1 — Base do produto (migrations 001–005)
Projeto iniciou com foco em **orçamentos e jobs**. As primeiras tabelas criadas foram `budgets`, `freelancers`, `jobs` e `job_payments`. O campo `total_value` em `jobs` é legacy — foi substituído por `revenue_total`/`cost_total` mas mantido por compatibilidade. Isso indica que a lógica financeira foi refatorada cedo.

### Fase 2 — Controle financeiro (migrations 006–013)
Após a base de jobs, foi adicionado o módulo de **despesas**. A evolução em múltiplas migrations (006→007→008→009→010→011→012→013) indica desenvolvimento incremental com correções frequentes: parcelamento adicionado depois do core, multimoeda adicionado depois do parcelamento. Padrão típico de MVP com escopo crescendo iterativamente.

### Fase 3 — Custos fixos (migrations 015–018)
Custos fixos foram adicionados depois de despesas. Migration 016 e 017 sugerem que o primeiro deploy de custos fixos quebrou em produção (campos NOT NULL sem valor padrão), exigindo migrations corretivas urgentes.

### Fase 4 — Dashboard e UX (sem migrations)
O dashboard foi construído inteiramente sobre dados já existentes. A ausência de migrations nessa fase sugere que foi um trabalho de apresentação/agregação puro, sem novo esquema.

### Decisões técnicas observadas

- **SVG charts sem biblioteca** — Recharts/Chart.js foram evitados deliberadamente. Os gráficos são SVGs puros com polilinha e gradiente. Trade-off: menos dependência, mais código manual.
- **Sem ORM** — Supabase SDK direto. Provavelmente por velocidade de desenvolvimento inicial.
- **Sem biblioteca de forms** — React Hook Form/Zod não foram adotados. Todo formulário é controlled state + validação manual.
- **Design system próprio** — Nenhuma biblioteca de UI (shadcn, MUI, Radix). Todos os componentes são custom Tailwind. Aumenta coerência visual mas aumenta o tempo de desenvolvimento.

### Mudanças de direção identificadas

- `total_value` em jobs ainda existe mas foi substituído por `revenue_total` — indica redesign financeiro no meio do projeto
- Migration 017 é uma query de inspeção, não uma migration real — indica investigação de bug em produção commitada por engano
- `name` em `fixed_costs` existe junto com `description` (duplicação) — indica que o campo foi adicionado para compatibilidade depois de criar o modelo original só com `description`

---

## 7. O que Ainda Falta

### Funcionalidades ausentes esperadas

| Funcionalidade | Por quê é esperada |
|----------------|-------------------|
| **Filtros de período no dashboard** | Pills de UI existem mas sem função |
| **Convidar membros ao workspace** | Tabela `workspace_members` suporta, UI não existe |
| **Gestão de coupons/afiliados** | Esquema completo no banco, sem UI |
| **Contratos** | Item no sidebar marcado "Em breve" |
| **Notificações por push/browser** | Só email implementado |
| **Exportação de relatórios (XLSX/CSV)** | Não existe nenhuma forma de exportar dados |
| **Histórico de alterações visível ao usuário** | `fixed_cost_history` existe no banco mas não tem UI |
| **Onboarding** | Nenhuma tela de boas-vindas/tutorial |
| **Edição de jobs a partir do orçamento aprovado** | Relação `budget_id` em jobs existe mas sem fluxo automático |

### Ajustes necessários para estabilização

1. Remover `console.log()` de produção
2. Corrigir guard de `client_email?.trim()`
3. Corrigir `exchange_rate: 0` ser silenciosamente aceito
4. Extrair `getWorkspaceId()` para utilitário compartilhado
5. Adicionar `.is('deleted_at', null)` em todas as queries de SELECT que faltam
6. Substituir `window.location.reload()` por `router.refresh()`
7. Configurar `next.config.ts` com `images.remotePatterns` para logos do Supabase

### Melhorias importantes antes de escalar

1. Adicionar testes para funções financeiras críticas (`calcJobFinancials`, `buildPaymentReminders`)
2. Validação de schema na fronteira com Zod
3. Logger centralizado (Sentry ou similar) para erros em produção
4. Substituir `window.confirm()` por modal de confirmação nativo no design system
5. Config centralizado para valores padrão (moeda, locale, timezone)

---

## 8. Próximos Passos Recomendados

### Correções críticas imediatas

1. **Remover `console.log()` de produção** — `fixed-costs.ts` linha 76
2. **Corrigir `client_email?.trim()`** — `jobs.ts`
3. **Corrigir `exchange_rate: 0`** — `expenses.ts`
4. **Extrair `getWorkspaceId()`** para `src/lib/utils/workspace.ts`
5. **Configurar `RESEND_API_KEY` e `CRON_SECRET` no Vercel** — Sem isso, notificações por email não funcionam

### Ajustes de curto prazo (1–2 semanas)

6. Substituir `window.location.reload()` por `router.refresh()`
7. Corrigir tipo `any` no webhook Stripe
8. Configurar `next.config.ts` (images, headers)
9. Adicionar Sentry (ou equivalente) para captura de erros em produção
10. Implementar filtros de período no dashboard (a UI já existe)

### Melhorias estruturais (2–4 semanas)

11. Adicionar Zod para validação de input em Server Actions
12. Testes unitários para lógica financeira (`calcJobFinancials`, `buildPaymentReminders`)
13. Substituir `window.confirm()` por componente de modal próprio
14. Criar `src/lib/config.ts` com valores padrão centralizados
15. Página de histórico de alterações (`fixed_cost_history`)

### Melhorias futuras (backlog)

16. UI de convite de membros ao workspace
17. Gestão de coupons/afiliados
18. Exportação de relatórios (XLSX/CSV)
19. Tela de onboarding para novos usuários
20. Contratos digitais (módulo já no sidebar)
21. Fluxo automático de job gerado a partir de orçamento aprovado
22. i18n / suporte a fuso horário explícito (America/Sao_Paulo)

---

## 9. Conclusão para Liderança

O **Lumora Finance** tem uma base técnica sólida e aproveítavel. A arquitetura Next.js + Supabase é adequada para o escopo do produto, o modelo de dados cobre os casos de uso principais, e os padrões adotados (soft delete, RLS, Server Actions, otimismo) são consistentes com boas práticas modernas.

O produto está em **MVP funcional**: os módulos principais (jobs, orçamentos, despesas, custos fixos, dashboard) estão operacionais. Um usuário real consegue usar o sistema para as tarefas centrais do dia a dia.

**Riscos principais identificados:**

1. **Nenhum teste automatizado** — Qualquer refactor em lógica financeira pode introduzir regressões silenciosas. Este é o risco técnico mais crítico antes de escalar usuários reais.
2. **Dívida técnica acumulada** — Padrões duplicados e validações incompletas aumentam o custo de manutenção conforme o produto cresce. Não é bloqueante hoje, mas vira gargalo em 2–3 meses.
3. **Features de UI entregues sem lógica** — Os filtros de período no dashboard criam expectativa no usuário que não é atendida. Devem ser implementados ou removidos antes do lançamento público.
4. **Email de notificações requer configuração manual** — Está codificado, mas só funciona após configurar variáveis de ambiente no Vercel. Sem isso, o cron roda e falha silenciosamente.

**Prioridade recomendada:** Antes de adicionar qualquer nova feature, dedicar um sprint de estabilização para as correções críticas e de curto prazo listadas acima. A base é boa — vale o investimento em consolidá-la antes de construir mais em cima.

---

*Relatório gerado por análise estática do codebase. Análise dinâmica (testes em ambiente real, profiling de performance, testes de carga) não foi realizada e pode revelar problemas adicionais.*
