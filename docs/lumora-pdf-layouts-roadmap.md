# Lumora — PDF Layouts Roadmap

Blueprint dos layouts PDF que o sistema deve ter em V1 + V2. Referência para
design e engenharia. Cada layout tem propósito claro, tom, dados mínimos e
prioridade relativa.

**Status geral (2026-04-23):** 5 de 10 templates vivos. O estilo "premium
minimalista" (Helvetica, paleta dark + dourado #C49A2C / #D4A853, meta em
cinza claro #fafafa com borda dourada) é a linguagem comum.

---

## 1. Orçamento (budget-document.tsx) — ✅ LIVE

**Uso:** envio para cliente pré-aprovação.
**Páginas:** 3 (capa + escopo + investimento).
**Dados:** cliente, entregáveis, itens visíveis, desconto, total.
**Destaque:** investimento com breakdown subtotal/desconto (quando >0).
**Prioridade:** P0 — essencial para vendas.

## 2. Pedido (order-document.tsx) — ✅ LIVE

**Uso:** confirmação de contratação pós-aprovação.
**Páginas:** 1 — compacto, formato fiscal-leve.
**Dados:** cliente, datas do evento, itens, condição de pagamento,
desconto, total, observações.
**Prioridade:** P0 — próximo passo natural do funil.

## 3. Freelance (job-document.tsx) — ✅ LIVE

**Uso:** recibo/nota para freelancers (pagamentos que você faz).
**Páginas:** 1.
**Dados:** freelancer, projeto, data, valor, observações.
**Prioridade:** P0 — fechamento operacional.

## 4. Contrato (contract-document.tsx) — ✅ LIVE

**Uso:** contrato formal (prestação de serviços, freela, confidencialidade).
**Páginas:** 2–4 dinâmico.
**Dados:** partes, cláusulas renderizadas via markdown, assinaturas.
**Prioridade:** P0.

## 5. Nota mensal / Recorrente (monthly-invoice-document.tsx) — ✅ LIVE

**Uso:** faturamento mensal de receita recorrente.
**Páginas:** 1.
**Dados:** mês referência, valor, condições, escopo resumido.
**Prioridade:** P0 — suporta assinaturas mensais.

---

## Próximos (V2 — janela Q3 2026)

## 6. Recibo de pagamento (receipt-document.tsx) — 🟡 PENDENTE

**Uso:** comprovante para cliente após pagamento recebido.
**Páginas:** 1 (concisa — endereço + valor + referência).
**Dados:** cliente, valor pago, data, pedido/orçamento de origem,
forma de pagamento.
**Tom:** formal mas curto. Não é contrato.
**Prioridade:** P1 — cliente frequentemente pede.

## 7. Proposta comercial longa (proposal-document.tsx) — 🟡 PENDENTE

**Uso:** apresentação de projeto maior (>R$ 20k) com contexto,
metodologia, cases.
**Páginas:** 5–8.
**Dados:** briefing expandido, equipe, timeline, 3 opções de escopo,
investimento comparado, case de portfolio.
**Tom:** narrativo, visual.
**Prioridade:** P2 — diferencial para contas B2B.

## 8. Demonstrativo de despesas (expense-report.tsx) — 🟡 PENDENTE

**Uso:** prestação de contas com cliente (reembolso de deslocamento,
hospedagem, equipamento).
**Páginas:** 1–2.
**Dados:** categoria, descrição, valor, comprovante anexado.
**Prioridade:** P2 — útil em produções com orçamento controlado.

## 9. Relatório mensal financeiro (monthly-pnl.tsx) — 🟡 PENDENTE

**Uso:** visão executiva do mês para o próprio usuário (não vai p/ cliente).
**Páginas:** 1.
**Dados:** receita, custos, lucro, pipeline, comparativo m-1.
**Tom:** dashboard print-ready.
**Prioridade:** P2 — PDF "cockpit" exportável.

## 10. Fechamento anual / DIRPF helper (annual-summary.tsx) — 🔵 BACKLOG

**Uso:** sumário anual pra ajudar em declaração de IR.
**Páginas:** 2.
**Dados:** total recebido, total pago a PJ/PF, totais por categoria,
clientes principais.
**Prioridade:** P3 — anual, muito valor em março/abril.

---

## Princípios de design (aplicar em todos)

1. **Helvetica + Helvetica-Bold.** Sem fontes externas (reduz bundle + mantém portabilidade A4).
2. **Paleta mínima:** `#1a1a1a` (texto), `#6b6b6b` (meta), `#C49A2C` (marca),
   `#e8e8e8` (divisores), `#fafafa` (backgrounds de bloco).
3. **Margem 60pt** (≈21mm) — consistente em todos os documentos.
4. **Rodapé discreto**: nome da empresa + data de emissão, 8pt.
5. **Logo opcional** no header — quando presente, texto do brand some.
6. **Sem JS dinâmico no render** — todos os valores calculados server-side.
7. **Moeda via Intl.NumberFormat('pt-BR')** com fallback graceful (`try/catch`).
8. **Datas sempre por `formatDate(iso)`** — nunca concatenar string raw.

## Princípios de dados

- **Nunca confiar em fonte única** — sempre aceitar `null/undefined` com
  fallback visível ("—") ou esconder o bloco todo.
- **Defensive casting:** `Number(x) || 0` em toda conversão monetária.
- **Workspace settings** pode ser null — sempre fallback ("Lumora Finance").
- **`show_in_pdf` flag nos itens** — respeitar em orçamentos e pedidos
  quando existir no schema.

## Pontos de evolução

- Centralizar helpers comuns (`formatMoney`, header, footer) em
  `src/lib/pdf/_shared.tsx` à medida que mais templates usarem o mesmo
  pattern.
- Considerar migrar para um tema central (`styles.ts` compartilhado)
  quando chegarmos em 7+ templates.
- Adicionar **QR code** na página final (opcional) para link direto à
  versão digital do documento.

---

*Última revisão: 2026-04-23 (P14 — blueprint pós deploy P8/P9/P10/P11/P12/P13).*
