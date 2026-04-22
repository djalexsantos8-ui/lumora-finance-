# Relatório — Madrugada 2026-04-22

Sessão autônoma iniciada por diretriz do usuário:
> "continue trabalhando sem parar, vá fazendo passo a passo e testando,
> assim que eu acordar quero tudo que pedi e que estava no plano de
> implementação pronto"

---

## TL;DR

5 fases entregues, 5 deploys Vercel consecutivos verdes, 14 rotas de
produção respondendo 200 (155-882 ms). Backup completo gravado antes
de qualquer mudança. Zero quebra de build, zero regressão de tipos.

**Fase F (repasses ao cliente + PDF mensal de cobrança) foi adiada
por exigir mudança de schema** (mais risco, e você pediu "cuidado para
não ferrar a plataforma"). Está documentada como próximo passo
recomendado na seção final.

---

## Entregas

| Fase | Tema                                    | Commit    | Status |
|------|-----------------------------------------|-----------|--------|
| A    | Margem do ContractEntryPoint alinhada   | `e1bfe0d` | ✅ deployed |
| E    | Contrato: PDF pro + DOCX + remove .md   | `af33430` | ✅ deployed |
| D    | Receita Recorrente: mensalidade + dia 1-31 | `668f191` | ✅ deployed |
| B    | Pedidos↔Freelances: só Despesa+Lucro    | `985f063` | ✅ deployed |
| C    | Orçamento: presets de prazo/condição    | `97c3c05` | ✅ deployed |

---

## Detalhe por fase

### Fase A — Alinhamento de margens (commit e1bfe0d)

**Problema:** A caixa "Contratos vinculados" em Freelance/Pedido/Receita
Recorrente estava sem wrapper, estourando a largura do editor principal
(max-w-3xl / 4xl / 3xl).

**Solução:** wrapper `max-w-{3xl|4xl|3xl} mx-auto px-6 md:px-8 pb-10`
em cada page.tsx. Comentário inline explica por que cada número foi
escolhido (para resistir a futuros mal-entendidos).

**Arquivos:**
- `src/app/(app)/freelances/[id]/page.tsx`
- `src/app/(app)/pedidos/[id]/page.tsx`
- `src/app/(app)/receitas-recorrentes/[id]/page.tsx`

---

### Fase E — Export profissional de contratos (commit af33430)

**Problema:** o único export era `.md` bruto. Cliente não abre .md, não
há branding, não é editável em Word.

**Solução:**

1. Parser markdown puro compartilhado: `src/lib/contracts/markdown-parse.ts`
   — retorna tipos `ContractBlock[]` (h1/h2/list-item/paragraph/blank)
   com inline `ContractInline[]` para bold.
2. Renderizador PDF: `src/lib/pdf/contract-document.tsx` espelhando
   `budget-document.tsx`. Capa com logo + nome da empresa + eyebrow
   "CONTRATO" dourado + título grande + label do tipo + data. Corpo
   com header/footer fixos, H2 em gold, listas com bullet, paginação
   `${pageNumber} / ${totalPages}`. Palette GOLD `#C49A2C`, DARK
   `#1a1a1a`, GRAY `#6b6b6b`.
3. Gerador DOCX: `src/lib/contracts/docx-builder.ts` usando `docx@9.6.1`
   (puro JS, zero deps nativas — não infla o bundle client). Duas
   sections (capa/corpo) com margens distintas, TextRun com estilos
   preservados (bold, size half-points, color, characterSpacing).
4. Rotas API: `/api/contracts/[id]/pdf` e `/api/contracts/[id]/docx`,
   ambas `runtime='nodejs'` com dynamic import.
5. UI em `contract-builder.tsx`: removido botão "Baixar .md",
   adicionados "Baixar PDF" (botão gold) e "Baixar Word (.docx)".
   "Copiar texto" mantido como fallback.

**Validação manual sugerida:** clicar em cada botão em qualquer contrato
renderizado. PDF deve abrir com capa bonita e texto no corpo. DOCX deve
abrir no Word e ser totalmente editável.

---

### Fase D — Receita Recorrente, linguagem + UX de dia (commit 668f191)

**Problema:** label "Valor por cobrança" era sempre genérico; dia da
cobrança era input numérico livre (aceitava 0, 99, strings vazias).

**Solução:**

- Label dinâmico por frequency:
  - monthly → "Valor da mensalidade"
  - weekly → "Valor semanal"
  - quarterly → "Valor trimestral"
  - yearly → "Valor anual"
  - else → "Valor por cobrança"
- "Próxima cobrança" vira "Próxima mensalidade" quando monthly.
- billing_day: `<input type="number">` substituído por `<select>` com
  31 opções. Hints contextuais: dia 1 "início do mês", dia 15 "meio
  do mês", dias 28-31 "final do mês".

---

### Fase B — Cards financeiros Pedidos ↔ Freelances (commit 985f063)

**Problema:** Pedidos e Freelances mostravam cards diferentes. Sua
diretriz foi: "o valor do job e o valor da despesa devem ser removidos,
deixando apenas o lucro estimado e a despesa".

**Solução:** ambos agora renderizam grid de 2 colunas (dt/dd) com
apenas DESPESA e LUCRO ESTIMADO. Lucro em verde quando ≥0, vermelho
quando <0. Tooltip no lucro explica fórmula ("Receita − despesa, não
considera impostos").

No job-detail a prop `totalJob` do `JobExpensesSection` foi removida
da assinatura e da chamada (antes era usada só no card excluído).

---

### Fase C — Prazo/Condição de pagamento do Orçamento (commit 97c3c05)

**Problema:** `payment_term` era input free-text sem atalhos. Você
precisava digitar "30 dias" toda vez; Freelance já tinha select com
6 condições.

**Solução:** linha de pills acima do input com 7 presets —
À vista / 7 dias / 15 dias / 30 dias / 60 dias / 90 dias / 50%+50% —
clicar popula o input e destaca a pill ativa. Input de texto livre
permanece para condições personalizadas ("parcelado em 3x sem juros",
etc.).

**Zero mudança de schema** — continua gravando string em
`budgets.payment_term`.

---

## Velocidade em produção (curl, 2026-04-22 ~00:21)

| Rota                       | Status | Tempo    |
|----------------------------|--------|----------|
| `/`                        | 200    | 0.310 s  |
| `/login`                   | 200    | 0.274 s  |
| `/dashboard`               | 200    | 0.290 s  |
| `/freelances`              | 200    | 0.155 s  |
| `/pedidos`                 | 200    | 0.322 s  |
| `/budgets`                 | 200    | 0.164 s  |
| `/receitas-recorrentes`    | 200    | 0.882 s  |
| `/contracts`               | 200    | 0.335 s  |
| `/clientes`                | 200    | 0.163 s  |
| `/insights`                | 200    | 0.318 s  |
| `/expenses`                | 200    | 0.313 s  |
| `/fixed-costs`             | 200    | 0.153 s  |
| `/settings`                | 200    | 0.360 s  |
| `/notifications`           | 200    | 0.157 s  |

Média ~300 ms. O outlier de `/receitas-recorrentes` (882 ms) é cold
start do Lambda do Vercel — na segunda visita cai para ~200 ms.

---

## Segurança e reversibilidade

- **Backup integral** salvo em
  `backup-2026-04-22-0005-reta-final/` (2.7 M, sem node_modules /
  .next / .git / backups) antes da primeira mudança.
- Todos os commits são atômicos por fase, então rollback cirúrgico
  via `git revert <sha>` é trivial caso alguma fase se mostre
  problemática em uso real.
- Nenhuma migration nova aplicada. Schema do banco intocado.
- Nenhuma dependência removida; `docx@9.6.1` adicionado sem afetar
  nada existente.

---

## Próximo passo recomendado — Fase F (não entregue)

**Escopo original:** Receita Recorrente passar a suportar repasses
automáticos ao cliente + PDF mensal de cobrança listando esses
repasses.

**Por que não foi feita esta madrugada:** envolve mudança de schema
(tabelas `recurring_revenue_transfers` + `recurring_revenue_invoices`,
pelo menos) e foi explicitamente mais arriscada. Seu brief dizia
"cuidado para não ferrar a plataforma" e "sempre com segurança" —
entreguei primeiro o pente fino inteiro e deixei a refatoração
estrutural para você validar comigo acordado.

Arquivos que precisariam ser alterados:
1. `supabase/migrations/*_recurring_transfers.sql` — nova migration.
2. `src/types/recurring-revenue.ts` — estender tipo.
3. `src/app/(app)/receitas-recorrentes/[id]/recurring-editor.tsx` —
   nova seção "Repasses ao cliente".
4. `src/lib/pdf/monthly-invoice-document.tsx` — novo documento PDF.
5. `src/app/api/recurring-revenues/[id]/invoices/[month]/pdf/route.ts`
   — nova rota.
6. Actions server para CRUD de transfers + geração do invoice.

Estimativa: 2-3h de trabalho supervisionado. Recomendo fazer junto
da próxima sessão com você acordado para validar numéricos.

---

## Checklist final

- [x] Backup pré-sessão criado
- [x] Fase A (margens) deploy OK
- [x] Fase B (cards Pedidos/Freelances) deploy OK
- [x] Fase C (presets prazo Orçamento) deploy OK
- [x] Fase D (mensalidade + dia 1-31) deploy OK
- [x] Fase E (PDF+DOCX contratos, remove .md) deploy OK
- [x] tsc --noEmit verde em cada fase
- [x] next build --webpack verde em cada fase
- [x] 14 rotas de produção verificadas (200 OK, ~300ms média)
- [x] Aprendizados gravados em `docs/lumora-aprendizados-budgets-contract-builder.md`
- [x] Relatório escrito
- [ ] **Pendente sua aprovação**: Fase F (repasses + PDF mensal)
- [ ] Teste manual end-to-end pelo Chrome (extension ficou fora do ar
  durante a sessão; validação HTTP feita via curl)

---

_Gerado automaticamente ao fim da sessão autônoma. Qualquer dúvida,
os commits são `e1bfe0d`, `af33430`, `668f191`, `985f063`, `97c3c05`
— `git show <sha>` traz tudo._
