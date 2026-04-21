# Blueprint — Refatoração Lumora Finance (2026-04-21)

Backup branch: `backup/pre-refactor-20260421-034800`

## Premissa

Lapidar o produto sem quebrar nada. Reusar agressivamente o que já existe em Freelances e Orçamentos. Usuário final é fotógrafo/filmmaker/produtora que procrastina — mínimo de cliques, clicou abriu, tudo salva previsível.

## Stack & contexto chave

- Next.js 16 App Router, React 19, Supabase SSR, Postgres + RLS
- Módulos existentes: dashboard, freelances, budgets (orçamentos), pedidos (stub simples), receitas-recorrentes, clientes, contracts (stub), expenses, fixed-costs, insights, notifications, settings
- `jobs` = freelance (UI exposta como "Freelance") — tem items de receita, custo, pagamentos, expenses e files
- `orders` = pedido (UI "Pedido") — hoje é só tabela plana; precisa ganhar items/expenses/files/PDF
- `budgets` = orçamento — tem budget_items, PDF, status flow
- `recurring_revenue` = receita recorrente

## Reuso identificado

| Componente | Origem | Reusável em |
|---|---|---|
| `TagCombobox` | `src/components/freelances/` | Pedidos, Receita Recorrente, Orçamentos |
| `FreelanceDateRange` | idem | Pedidos, Receita Recorrente |
| `ClientCombobox`/`ClientField` | `src/components/clients/` | já usado em todo lugar |
| `JobFileUploadModal` | freelances | Pedidos (generalizar `jobId` → `recordId` + `tableContext`) |
| `StatusStepper` | freelances | Pedidos (precisa parametrizar) |
| `DraftBadge`, `SaveStatus` | freelances | Pedidos |
| `expenses` table | já centralizada | Pedidos via `order_id` |
| Narrativa do dashboard | `src/lib/dashboard/narrativa/abas/*.ts` | expandir variações |

## Fases de execução

### Fase 1 — Listas canônicas compartilhadas
- Criar `src/lib/canonical/lead-sources.ts` e `src/lib/canonical/segments.ts`
- Expandir com inteligência comercial real para público criativo
- Atualizar `job-detail.tsx` para importar das canônicas
- Reuso: orçamentos, pedidos, receita recorrente

### Fase 2 — Limpezas rápidas
- Remover "Limpar rascunhos vazios" da lista de orçamentos
- Server action `deleteEmptyDraftBudgets` pode ficar (inócua)

### Fase 3 — Pedidos (big one)
3a. Migration: adicionar campos em `orders` (project_description, deliverables, lead_source, client_segment, notes_internal, payment_condition, order_date_start/end) + criar `order_items` (estilo `job_revenue_items`) + `order_files` (estilo `job_files`) + adicionar `order_id` em `expenses` (mirror automático igual freelance já faz).
3b. Server actions: `order-items.ts`, `order-files.ts`, update em `orders.ts`, integração em `expenses.ts` (já genérico).
3c. Reescrever `pedidos/[id]/order-editor.tsx` com estrutura do `job-detail.tsx`: form de topo (cliente, datas, lead, segmento, moeda, status, notas), seção de items, seção de despesas, seção de comprovantes (files).
3d. Criar `/api/orders/[id]/pdf` + `src/lib/pdf/order-document.tsx` derivado de `job-document.tsx`.

### Fase 4 — Receita Recorrente polish
- Migration: adicionar `project_description`, `lead_source` (já tem `segment`). 
- Expandir lista de `segment` via canônica.
- Melhorar placeholder e exemplos.
- Opcional: `renewal_date`, `scope_monthly`, `last_adjustment_at`.

### Fase 5 — Dashboard: renomear "Conclusão" → "Dashboard"
- Renomear `AbaKey` `conclusao` → `dashboard` em `client.tsx`
- Renomear label visible
- Trocar `PaneConclusao` por `PaneDashboard` com filtros por cliente/segmento/lead_source
- Expandir variações de narrativa (cada bloco: novos ramos if/else para cenários críticos, ambíguos, etc.)

### Fase 6 — Orçamento converter em X
- Novo server action `convertBudgetTo(budgetId, target: 'order' | 'freelance' | 'recurring')`
- Copia campos + items relevantes para a tabela destino
- Botão no `budget-editor` quando `status='approved'`

### Fase 7 — Notificações acionáveis
- Nova action `markFixedCostAsPaid(costId)` — grava em `fixed_cost_payments` (se existir) ou usa campo `last_paid_date`
- Nova action `markJobAsPaid(jobId)` — chama `addPayment` com valor total restante
- Botões inline em `AlertRow`

### Fase 8 — Diário do Cliente (opcional)
- Tabela `client_notes` (client_id, author_id, content, created_at, tags)
- Component timeline em `clientes/[id]`

### Fase 9 — Configurações sub-abas (opcional)
- Extrair `SettingsForm` em múltiplos componentes: BrandingTab, CompanyTab, FiscalTab, BankTab, PdfPrefsTab
- Migration: adicionar `cnpj`, `cpf`, `legal_name`, `address`, `bank_info` em `workspace_settings`

### Fase 10 — Contratos enxuto
- Migration: `contracts` table (budget_id FK, client_id, content, status, signed_at)
- Editor + PDF

## Estratégia de deploy

Deploy incremental por fase — cada fase grande vira commit separado + push imediato. Vercel auto-deploy. Smoke test em prod após cada deploy.

## Riscos e mitigação

- **Migration em produção**: CI do Supabase está quebrado (secrets faltando). Aplicar via Management API (token do dashboard) como feito na noite passada. Sempre `DROP IF EXISTS` + recriação idempotente para tabelas novas.
- **Quebra de PDF existente**: não mexer em budget-document.tsx nem job-document.tsx. Só criar novos.
- **Status enum drift**: nova tabela order_items usa `text + CHECK` (não enum) — lição da última madrugada.
- **RLS**: toda tabela nova precisa de policy via `workspace_members`.
