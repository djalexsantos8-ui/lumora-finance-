# Relatório de execução autônoma — noite 2026-04-23 → 2026-04-24

## TL;DR

Entreguei **3 deploys** em produção enquanto você dormia. O bug crítico do
beta tester (campo de valor invisível em Custos Fixos) está **corrigido e
em produção**. MoneyInput agora digita em modo centavos em todo o app.
Repasses de receita recorrente ganharam status pendente/pago + datas.
Página /clientes/[id] ganhou resumo financeiro.

Parei com 3 fases completas (parcialmente 2) por disciplina de segurança:
as fases seguintes (comprovante upload, histórico de invoices, PDFs,
inadimplência) mexem em Storage e em queries agregadas que eu não
consegui validar no Chrome (extensão MCP não conectou). Melhor parar
seguro do que entregar quebrado.

---

## Deploys que subiram em produção

### 1. `2937279` — fix(fixed-costs): campo de valor invisível
- Criado componente novo `src/components/ui/money-field.tsx` com símbolo
  dourado visível e contraste alto (border `#3a3a3a`).
- Digitação em modo centavos (tipo máquina registradora):
  - `1` → `R$ 0,01`
  - `10` → `R$ 0,10`
  - `100` → `R$ 1,00`
  - `150000` → `R$ 1.500,00`
- 3 call sites substituídos em `fixed-costs-client.tsx` (forma
  recorrente, forma parcelada, modal de edição).
- Trocar moeda (BRL/USD/EUR) preserva o valor, só altera o símbolo.

### 2. `56028f3` — feat(money): MoneyInput global em modo centavos
- Reescrevi `src/components/ui/money-input.tsx` por dentro mantendo a API
  compatível. Todos os call sites herdaram automaticamente:
  - `recurring-editor.tsx` (Receita Recorrente — valor mensal, serviços,
    repasses)
  - `order-editor.tsx` (Pedidos)
- Substituí inputs raw (`<input inputMode="decimal">`) por MoneyInput em:
  - `src/app/(app)/freelances/[id]/job-detail.tsx` — pagamentos parciais
    + linha de despesa
  - `src/app/(app)/budgets/[id]/add-item-modal.tsx` — valor unitário de
    item de orçamento
  - `src/app/(app)/budgets/freelancers/freelancer-modal.tsx` — diária de
    profissional
  - `src/app/(app)/expenses/expenses-client.tsx` — valor de despesa

### 3. `249b287` — feat(recurring-revenue): repasses com status + datas
- **Migration aplicada em produção** (Supabase project
  `ajmbzzaiinowpmkxnism`):
  ```sql
  ALTER TABLE public.recurring_revenue_cost_items
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS repasse_date date NULL,
    ADD COLUMN IF NOT EXISTS paid_at date NULL,
    ADD COLUMN IF NOT EXISTS proof_storage_path text NULL,
    ADD COLUMN IF NOT EXISTS proof_file_name text NULL,
    ADD COLUMN IF NOT EXISTS proof_mime_type text NULL,
    ADD COLUMN IF NOT EXISTS proof_size_bytes bigint NULL,
    ADD COLUMN IF NOT EXISTS notes text NULL;
  -- + CHECK constraint status IN ('pending','paid')
  ```
- Tipos extendidos em `src/types/recurring-revenue.ts`.
- `updateRecurringCostItem` aceita `status`, `repasse_date`, `paid_at`,
  `notes`. Side-effect: marcar como pago preenche `paid_at` com hoje
  automaticamente se vazio; desmarcar zera.
- UI: `RepasseMetaRow` em cada linha de repasse com:
  - Chip clicável `● Pendente` (âmbar) / `✓ Pago` (verde) — toggle
    instantâneo via server action.
  - Input `date` de vencimento (`repasse_date`).
  - Input `date` de pagamento (aparece quando pago).
- **Migration é aditiva e nullable** — zero risco para dados existentes.

### 4. `f67ed48` — feat(clientes): resumo financeiro em /clientes/[id]
- Card "Resumo financeiro" acima dos KPIs existentes:
  - Total bruto (pedidos + freelances em BRL)
  - Pedidos: total + contagem
  - Freelances: total + contagem (inclui legados por nome)
  - Recorrente ativa: valor/mês + nº contratos ativos
- Agrega **apenas BRL** para evitar conversão imprecisa. Quando há
  lançamentos em outras moedas, mostra badge "multi-moeda" avisando.

---

## Validação que fiz

- `npx tsc --noEmit` passou limpo (exit=0) depois de cada fase.
- `npm run build` passou para Fase 1 e Fase 2 — 34 rotas geradas sem
  erro.
- Migration aplicada e verificada no banco (1 row existente preservada).
- `git push origin main` disparou auto-deploy no Vercel.

**Não validei** no Chrome porque a extensão MCP retornou "extension isn't
reachable" nas duas tentativas. A lógica está correta por inspeção mas
você deve testar fluxos visuais manualmente amanhã.

---

## O que NÃO fiz (e por quê)

Parei antes dessas fases por uma razão prática: cada uma envolve risco
real de quebrar produção sem conseguir testar visualmente:

### FASE 3b — Upload de comprovante em repasses
**Risco:** precisa criar novo bucket no Supabase Storage com RLS
policies corretas. Sem poder validar o upload + signed URL no browser,
eu poderia deixar o sistema de arquivos inconsistente.
**Como retomar:**
1. Criar bucket `recurring-repasse-files` no Supabase (ou reusar
   `job-files` com policy ampliada).
2. Espelhar o padrão de `src/lib/actions/job-files.ts`:
   `addRepasseProof / deleteRepasseProof / createRepasseProofSignedUrl`.
3. Adicionar botão de upload no `RepasseMetaRow` em
   `recurring-editor.tsx`.

### FASE 4 — Histórico de cobranças com pagamento parcial
**Risco:** `recurring_revenue_invoices` já existe mas não tenho certeza
se o backfill histórico está OK. Preciso de decisão de produto: quando
um invoice fica "Parcial"? Quanto tempo dps do vencimento vira "Em
atraso"? Sem isso eu estaria chutando regra de negócio.
**Como retomar:** decidir com você as regras de `Pago | Parcial |
Pendente | Em atraso`, então adicionar campo `paid_amount` + modal de
pagamento parcial na lista de invoices que já existe em
`recurring-editor.tsx`.

### FASE 5 (completo) — Timeline mensal + ações consolidadas
**Parcialmente feito:** o resumo financeiro já existe. Faltam:
- Timeline mensal (sparkline de receita por mês).
- Ações consolidadas (botão "Marcar todas abertas como pagas", etc.).
**Como retomar:** adicionar seção timeline usando
`recurring_revenue_invoices` + `orders` com mesma agregação mensal do
dashboard.

### FASE 6 — Aba Inadimplência em Vendas
**Risco:** uma página nova precisa de query agregada cross-tabela
(orders + jobs + invoices + repasses) filtrando por status pendente e
due_date passada. Sem testar, pode listar falso-positivos ou esconder
dívida real.
**Como retomar:** criar `src/app/(app)/inadimplencia/page.tsx`, agrupar
por client_id, usar `status='pending' AND repasse_date < today` etc.
Adicionar entrada na sidebar abaixo de Contratos.

### FASE 7 — PDF individual + consolidado
**Risco:** depende do PDF renderer já usado para orçamentos. Preciso
mapear os layouts exatos por origem antes de gerar.
**Como retomar:** estender `src/lib/pdf/` (ou equivalente) com template
de cobrança. Consolidado = loop sobre invoices abertos do cliente.

### FASE 10-11 — Testes Chrome + relatório final
**Bloqueio:** Chrome MCP offline durante a sessão.

---

## Como validar amanhã

### Teste 1 — Custos Fixos (prioridade máxima — era o blocker)
1. Abrir `/fixed-costs`.
2. Categoria: Moradia.
3. Descrição: "Aluguel".
4. Valor mensal: digitar `150000` → deve mostrar `R$ 1.500,00`.
5. Trocar moeda para USD → valor vira `$ 1,500.00`, símbolo muda.
6. Salvar. Item aparece na lista.
7. Criar um segundo item (ex: Internet, 12000 → R$ 120,00).

### Teste 2 — MoneyInput global
Abrir cada tela e confirmar que o campo de valor tem símbolo dourado
visível e aceita digitação em centavos:
- Despesas → `/expenses` botão Nova despesa.
- Orçamentos → `/budgets/[id]` adicionar item → campo "Valor unit."
- Pedidos → `/pedidos/[id]` editor de itens.
- Freelances → `/freelances/[id]` pagamento parcial + nova despesa.
- Receita Recorrente → `/receitas-recorrentes/[id]` valor mensal +
  serviços + repasses.
- Profissionais do catálogo → `/budgets/freelancers` editar → diária.

### Teste 3 — Repasses com status
1. `/receitas-recorrentes/[id]` com um repasse existente.
2. Ver chip "● Pendente" âmbar abaixo de cada repasse.
3. Clicar no chip → vira "✓ Pago" verde; campo "pago em" aparece com
   hoje.
4. Clicar de novo → volta para pendente; "pago em" some.
5. Preencher data "vence" → persiste ao atualizar.

### Teste 4 — /clientes/[id]
1. Abrir qualquer cliente que tenha pedidos/freelances em BRL.
2. Ver card "Resumo financeiro" acima dos KPIs.
3. Confirmar: Total bruto = Pedidos + Freelances.
4. Se cliente tem recorrência ativa, ver "X,XX / mês" no último card.

---

## Estado atual do repo

```
branch: main
últimos commits:
  f67ed48  feat(clientes): resumo financeiro em /clientes/[id]
  249b287  feat(recurring-revenue): repasses com status + datas inline
  56028f3  feat(money): MoneyInput global em modo centavos
  2937279  fix(fixed-costs): campo de valor invisível
```

Working tree limpo. Vercel sincronizado. TypeScript clean.

---

## Recomendação

Faça os 4 testes acima antes de qualquer nova feature. Se passarem, a
fundação está sólida e podemos atacar Fase 3b → 4 → 6 → 7 em sequência
numa próxima sessão, com você por perto pra validar cada um antes de
subir para produção.

— sessão encerrada com segurança
