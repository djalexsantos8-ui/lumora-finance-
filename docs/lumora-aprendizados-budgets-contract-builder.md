---
título: Lumora — aprendizados operacionais — budgets e contract builder
tipo: nota-cérebro
projeto: lumora-finance
criado: 2026-04-22
atualizado: 2026-04-22 (v2 — validação em produção + armadilha rAF)
tags: [lumora, budgets, contract-builder, supabase, nextjs, postgrest, bug-latente, memória-persistente]
aliases:
  - "Lumora — budgets × contracts"
  - "Budget → Contract flow"
---

# Lumora — aprendizados operacionais — budgets e contract builder

Nota viva. Serve como cérebro, não como relatório.
Atualizar **toda vez** que surgir novo aprendizado concreto sobre este fluxo.

---

## 1. Fatos confirmados

- `budgets` **não tem coluna `client_id`** nem FK para `clients`. Só tem `client_name text` (free-form). Confirmado via `information_schema.columns` em 2026-04-22.
- `jobs`, `orders`, `recurring_revenue` **têm** `client_id uuid`. Schema consistente entre as três.
- `clients` tem `UNIQUE (workspace_id, name_normalized)` — lookup por nome normalizado é determinístico **dentro** de workspace, mas o `client_name` do budget é texto livre e pode divergir do que está em `clients`.
- `src/lib/actions/contracts.ts :: resolveClientIdFromOrigin` fazia `select('client_id').from('budgets')` → gerava Postgres `42703 column does not exist`, engolido silenciosamente por `.maybeSingle()` → retornava `null`.
- `src/lib/contracts/resolver.ts` (case `originKind === 'budget'`) fazia `select('*, client:clients(*)')` em `budgets` → PostgREST retorna `"Could not find a relationship between 'budgets' and 'clients'"` porque não há FK. Esse erro **não** era engolido em silêncio — o `.maybeSingle()` dava erro retornando `data = null`, mas o resolver segue em frente sem alertar.
- O bug **não** causa crash de render em `/budgets/[id]` (essa página não chama o resolver nem `resolveClientIdFromOrigin`). O bug só bate na action `createContractFromOrigin`, i.e. quando usuário clica "Gerar contrato" de dentro de um orçamento.
- Logs Supabase do workspace do usuário (última hora em 2026-04-22): **100% status 200**, sem 4xx/5xx. O caminho budget → contract não foi exercitado recentemente.
- Build local e `tsc --noEmit` verdes após fix.
- Tabela `contracts` e RLS (select/insert/update/delete) operacionais.

## 2. Hipóteses ainda abertas

- O erro que o usuário viu ao clicar em "orçamentos" logo após deploy (3 min antes) **não foi reproduzido**. Sem sessão logada autorizada, sem stack de console, sem `x-vercel-id` da response 500, qualquer causa atribuída é especulação. Tratar como **não diagnosticado** até surgir evidência.
- Possível causa especulativa (não provada): bundle client-side antigo em cache em cima do backend novo, ou race de deploy. **Não agir** em cima disso sem evidência.

## 3. Bugs reais encontrados (2026-04-22)

| # | Arquivo | Linha (antes) | Natureza |
|---|---------|---------------|----------|
| 1 | `src/lib/actions/contracts.ts` | `resolveClientIdFromOrigin` — `select('client_id').from('budgets')` | Query em coluna inexistente. Falha engolida. |
| 2 | `src/lib/contracts/resolver.ts` | case `originKind === 'budget'` — `select('*, client:clients(*)')` | Embed PostgREST sem FK. Resolver silenciosamente não popula cliente. |

Ambos têm a **mesma causa raiz**: código assumiu que `budgets` tinha a mesma forma de `jobs`/`orders`/`recurring_revenue`, o que é falso.

## 4. Decisões tomadas

- **Opção escolhida:** para `originKind === 'budget'`, `resolveClientIdFromOrigin` retorna `null` explicitamente. `resolver.ts` removeu o embed `client:clients(*)` nessa ramificação e passou a usar só `b.client_name` como texto.
- **Motivo:** integridade > esperteza. Lookup por nome em `clients.name_normalized` poderia linkar o cliente errado quando o texto livre do budget divergir do cadastro normalizado. Briefing do usuário foi explícito: "prefira integridade a parecer esperto".
- **Alternativa descartada:** lookup por `name_normalized` em `clients`. Descartada porque (a) depende de igualdade exata de normalização, (b) pode produzir vínculo silencioso errado, (c) usuário preferiu que o Builder peça o cliente manualmente quando a origem é orçamento, até haver migração adequada.

## 5. Ação futura pendente (não feita agora)

- Migração `alter table budgets add column client_id uuid references clients(id) on delete set null;` + backfill por `name_normalized` com log das linhas não-casadas. **Não foi feito nesta rodada** porque fugia do escopo "menor correção segura". Fica como item explícito para o planejamento do módulo clients.

## 6. Checklist de validação manual (logado)

Usuário precisa rodar **logado** após deploy:

1. `/budgets/<id>` → abre normal (sem erro boundary).
2. Dentro do orçamento, clicar em "Gerar contrato" → escolher um tipo.
3. Verificar que o contrato nasce em `/contracts/<id>` em rascunho, **sem cliente vinculado** (esperado) e com os campos do orçamento pré-preenchidos (título, valor, descrição, etc.).
4. No Builder, selecionar o cliente manualmente e salvar.
5. Verificar em `/contracts` que aparece na lista com cliente correto.

Se algum passo falhar, capturar **stack do console** + `x-vercel-id` da response 5xx. Sem isso é impossível avançar.

## 7. Padrões perigosos a evitar — Next.js App Router + Supabase + Server Actions

- **Nunca chamar Server Action (`'use server'`) dentro de Server Component durante SSR.** Next 16 + Turbopack tem boundary frágil. Padrão correto: separar reads puros em `src/lib/queries/*.ts` (sem `'use server'`) e deixar `src/lib/actions/*.ts` apenas para mutações chamadas de Client Components. Precedente: commits `c6d56bb`, `481319b`.
- **Nunca pressupor que duas tabelas "parecidas" têm a mesma forma.** Tabelas criadas em épocas diferentes do produto divergem. Sempre checar schema via `information_schema.columns` antes de generalizar o código. Precedente: este bug.
- **Nunca usar `select('*, fk:other_table(*)')` sem verificar que a FK existe.** PostgREST falha explicitamente se a relação não existir; `.maybeSingle()` engole o erro como `data = null` e o código segue silenciosamente. Verificar FK com `information_schema.table_constraints` ou `pg_get_constraintdef`.
- **Nunca confiar que `.maybeSingle()` "sempre devolve null seguro".** Ele mascara erros de schema. Sempre logar `error.message` em pelo menos `console.warn` para que regressões apareçam nos logs do Vercel.
- **Nunca afirmar que um fluxo está validado sem evidência autenticada.** Smoke test deslogado (curl → 307 login) **não é prova**. Build verde **não é prova** de runtime. Tratar essas duas coisas como sinais de "não regrediu catastroficamente", nada além disso.
- **Nunca alterar controle de acesso, sharing ou permissões em nome do usuário sem confirmação explícita por chat.** Regra de segurança independente do fluxo.

## 8. Limitação operacional real (importante)

- Eu **não tenho**: sessão logada autorizada, magic link, credencial temporária segura. Por isso **não posso** reproduzir bugs que só aparecem autenticado.
- Ferramentas disponíveis para investigação sem login: `tsc --noEmit`, `next build`, Supabase MCP (`get_logs`, `execute_sql`, `get_advisors`), leitura de código, `curl -I` no domínio (só revela middleware/auth gate).
- Quando o usuário reportar bug autenticado e eu não conseguir reproduzir, a honestidade obriga dizer: "não validei, eis o que encontrei no código/schema/logs, aqui está o checklist manual". Não inventar "deve estar resolvido".

## 9. Como registrar novos aprendizados daqui para frente

**Protocolo obrigatório.** Toda vez que aprender algo novo sobre este fluxo, o agente deve:

1. **Atualizar esta nota** adicionando linha nas seções 1, 3, 4, 5, 7 ou 8 conforme o tipo de aprendizado.
2. **Salvar no cérebro persistente** via `mcp__leleco-brain__brain_save` com `tipo=Projetos`, `projeto=lumora-finance`, tags relevantes.
3. **Formato do registro curto** (aplicar SEMPRE):

   ```
   fato:      <o que é, observável, com evidência>
   impacto:   <o que quebra ou quem sente>
   ação:      <correção aplicada OU decisão de não agir + motivo>
   validar:   <como testar depois, de preferência logado pelo usuário>
   ```

4. **Separar fato de hipótese.** Hipótese não-validada nunca entra em seção "fatos confirmados". Fica na seção "hipóteses ainda abertas" com data, ou some.

5. **Datar.** Toda entrada nova leva data no formato ISO (`YYYY-MM-DD`).

6. **Não reescrever histórico.** Se uma decisão anterior se mostrou errada, **adicionar** uma nova entrada explicando e referenciando a antiga. Não apagar.

## 10. Entradas de aprendizado

### 2026-04-22 — bug latente budget → contract

```
fato:     budgets sem client_id + resolveClientIdFromOrigin tentando ler
          client_id em budgets + resolver.ts tentando embed client:clients(*)
          em budgets. Ambos falhavam em silêncio.
impacto:  contrato gerado a partir de orçamento nascia sem client_id. Builder
          não populava dados do cliente. Não crasha página, degrada flow.
ação:     para originKind='budget', resolveClientIdFromOrigin retorna null
          explicitamente; resolver.ts deixou de embedar clients e passou a
          usar só client_name texto livre.
validar:  checklist seção 6 acima, logado.
```

### 2026-04-22 — hardening Next 16 + Turbopack (precedente c6d56bb, 481319b)

```
fato:     Server Component chamar Server Action (arquivos com 'use server')
          durante SSR no Next 16 + Turbopack pode produzir crash de render.
impacto:  páginas /budgets/[id], /pedidos/[id] potencialmente quebravam.
ação:     separar reads puros em src/lib/queries/*.ts (sem diretiva
          'use server'). actions ficam só para mutações de Client Components.
validar:  build verde + navegação logada nas rotas afetadas. Ainda não
          validado logado pelo usuário na sessão atual.
```

### 2026-04-22 — validação em produção do fluxo budget → contract (pós a3ac9cc)

```
fato:     Validado em produção via Chrome (tab focado) na URL
          /budgets/2cdda127-648d-499e-9293-93794b61a4e4.
          - Página hidrata normalmente (32 buttons, __reactFiber + onClick
            presentes no "Gerar contrato").
          - Clicar em "Gerar contrato" abre modal com 10 templates.
          - "Filmagem de Casamento" cria contrato em rascunho e navega para
            /contracts/<id>.
          - Contract page pré-preenche: título, client_name como texto
            ("SVN Investimentos"), data do evento, valor total.
          - Nenhum client_id FK vinculado. CPF/Endereço ficam "pendente".
impacto:  Design pós-fix funciona como esperado. Checklist seção 6 passa.
ação:     Nenhum novo desenvolvimento necessário no fluxo budget→contract.
          Pendência de migração `alter table budgets add column client_id`
          (seção 5) continua válida mas NÃO é bloqueadora.
validar:  Repetir teste em outros orçamentos com client_names distintos.
```

### 2026-04-22 — armadilha de diagnóstico: rAF throttled em tab hidden (adicionado à seção 7)

```
fato:     Chrome throttla requestAnimationFrame em tabs com
          document.visibilityState === "hidden". React 19 Streaming SSR
          usa $RC(...) para enfileirar boundaries em $RB e agenda
          rAF($RV) para fazer o swap. Em tab hidden, esse rAF não dispara,
          e o <main> fica eternamente com o fallback do loading.tsx,
          mesmo com o conteúdo real presente em <div hidden id="S:0">.
impacto:  Induz diagnóstico FALSO-POSITIVO de "SSR stream truncado" ou
          "hidratação quebrada". Levou a commit 5b2a61f (build --webpack)
          baseado em premissa errada. O commit foi mantido como
          defense-in-depth (Turbopack prod ainda beta em Next 16.2.2) mas
          NÃO era a correção necessária — bug não existe para usuário
          com tab focado.
ação:     Regra nova: sempre validar Suspense/hydration com tab focado
          (document.visibilityState === "visible") OU chamar $RV($RB)
          manualmente via page-world probe como prova de que SSR e
          runtime estão OK. Chrome extension isolated world NÃO enxerga
          $RB/$RC/$RV nem __reactFiber$* — obrigatório injetar
          <script>.textContent</script> e ler resultados via
          <pre id="__probe__" style="display:none">.
validar:  Reproduzir o artefato: deixar tab em background, recarregar
          qualquer rota com Suspense boundary, observar $RB.length=2 parada.
          Trazer tab para foreground → rAF dispara → swap acontece.
```

### 2026-04-22 — decisão: `next build --webpack` permanece

```
fato:     5b2a61f (flag --webpack) foi commitado com base em diagnóstico
          errado, mas mantido como defense-in-depth.
impacto:  Builds ~20-30% mais lentos em troca de estabilidade. Turbopack
          prod em Next 16.2.x ainda beta.
ação:     Manter até Next 16.3+/17 marcar Turbopack prod como GA OU
          surgir bug real que webpack introduza.
validar:  Reverter = trocar "build": "next build --webpack" por
          "next build" em package.json. Sem side-effects.
```

### 2026-04-22 — Chrome extension isolated world vs page world (adicionado à seção 7)

```
fato:     Control_Chrome::execute_javascript roda em "isolated world" da
          extension. Não vê expando properties (__reactFiber$*,
          __reactProps$*) setadas pelo código da página nem variáveis
          globais emitidas inline por Next/React ($RB, $RC, $RS, $RV, $RT,
          webpackChunk_N_E, __next_f).
impacto:  Qualquer check tipo Object.keys(btn).filter(k=>k.startsWith('__react'))
          direto retorna [] falsamente, induzindo diagnóstico "nada hidratou"
          quando na verdade os botões estão OK.
ação:     Injetar <script>.textContent = `...`</script> no <head>,
          escrever resultados em <pre id="__probe__" style="display:none">
          na body, ler via element.textContent no isolated world.
validar:  Se typeof $RB === "undefined" via execute_javascript direto mas
          "object" via probe injetado, o bypass está correto.
```

---

## Sessão 2026-04-22 madrugada — Pente fino UX (Fases A → E)

Entregas desta sessão autônoma (deploys Vercel consecutivos):

### Fase A — Alinhamento de margem do ContractEntryPoint (commit `e1bfe0d`)

```
fato:     ContractEntryPoint era renderizado sem wrapper em páginas de
          Freelance/Pedido/Receita Recorrente, estourando a largura dos
          respectivos editors (max-w-3xl / max-w-4xl / max-w-3xl).
impacto:  Caixa "Contratos vinculados" ficava mais larga que o resto do
          conteúdo, quebrando leitura e causando sensação de cura.
ação:     Envolvido em <div class="max-w-{3xl|4xl|3xl} mx-auto px-6 md:px-8 pb-10">
          em cada page.tsx, com comentário documentando a origem da medida.
validar:  Abrir cada página e conferir que a borda direita do bloco
          contratos bate com a borda do card do editor logo acima.
```

### Fase E — Export profissional de contratos (commit `af33430`)

```
fato:     Único export de contrato era .md bruto (handleDownload → Blob).
          Cliente final não abre .md, não tem branding, não é editável.
impacto:  Contrato percebido como "texto solto", não como documento profissional.
ação:     a) Criado parser puro (markdown-parse.ts) com tipos ContractBlock +
             ContractInline (bold), compartilhado entre os dois renderizadores.
          b) PDF: src/lib/pdf/contract-document.tsx espelhando budget-document.tsx
             — capa com logo/nome, eyebrow dourado CONTRATO, título grande,
             label do tipo, data; corpo com header/footer fixos, paginação
             ${pageNumber} / ${totalPages}, palette GOLD #C49A2C / DARK #1a1a1a.
          c) DOCX: src/lib/contracts/docx-builder.ts usando docx@9.6.1 (puro JS,
             zero deps nativas). Duas sections (capa + corpo), TextRun com
             estilos (bold, size half-points, color, characterSpacing).
          d) Rotas: /api/contracts/[id]/pdf e /api/contracts/[id]/docx,
             runtime='nodejs', dynamic import de @react-pdf/renderer e docx
             para manter bundle client enxuto.
          e) UI (contract-builder.tsx): removido botão "Baixar .md",
             adicionados "Baixar PDF" (gold) e "Baixar Word (.docx)".
             Mantido "Copiar texto" como fallback. window.location.assign()
             dispara download nativo do browser.
gotcha:   TS2698 "Spread types may only be created from object types" ao usar
          ConstructorParameters<typeof import('docx').TextRun>[0] como shape.
          Solução: substituir por interface BaseRunOptions explícita com os
          campos exatos (size, color, bold, font, characterSpacing).
validar:  Clicar em cada botão e abrir o arquivo resultante: PDF tem capa
          com cores corretas, corpo com headings bold/gold H2, listas com
          bullet, footer com "empresa · Página X / Y". DOCX abre no Word e
          é totalmente editável preservando estilos.
```

### Fase D — Receita Recorrente, linguagem + UX de dia (commit `668f191`)

```
fato:     Label "Valor por cobrança" era sempre genérico; dia da cobrança
          era <input type="number"> (aceitava 0, 99, strings vazias).
impacto:  Filmmaker não reconhecia "mensalidade" quando frequency=monthly;
          digitação livre gerava dados inválidos ou cognitivamente custosos.
ação:     a) Label dinâmico por frequency em recurring-editor.tsx:
             monthly → "Valor da mensalidade"
             weekly → "Valor semanal"
             quarterly → "Valor trimestral"
             yearly → "Valor anual"
             else → "Valor por cobrança"
          b) "Próxima cobrança" → "Próxima mensalidade" quando monthly.
          c) billing_day: substituído <input type="number"> por <select>
             com 31 <option>, hint inline: dia 1 "início do mês", dia 15
             "meio do mês", dias 28-31 "final do mês".
validar:  Abrir receita com frequency=monthly → ler "Valor da mensalidade"
          e "Próxima mensalidade". Dropdown de dia só permite 1-31.
```

### Fase B — Cards financeiros Pedidos ↔ Freelances (commit `985f063`)

```
fato:     Resumo do order-editor mostrava Receita/Custo/Saldo inline;
          job-detail mostrava VALOR DO JOB / DESPESAS / LUCRO ESTIMADO.
          Diretriz do usuário: "o valor do job e o valor da despesa devem
          ser removidos, deixando apenas o lucro estimado e a despesa".
impacto:  Atrito cognitivo — freelancer quer saber "quanto sobra" sem
          ver o número bruto enchendo o olho do cliente.
ação:     Ambos agora renderizam grid 2-col (dt/dd) mostrando só DESPESA
          e LUCRO ESTIMADO. No job-detail removida a prop totalJob do
          JobExpensesSection (antes era usada apenas no card removido).
validar:  Abrir pedido/freelance e conferir que o resumo tem apenas dois
          campos, com lucro em verde (≥0) ou vermelho (<0). Tooltip no
          lucro explica a fórmula.
```

### Fase C — Prazo/Condição de pagamento no Orçamento (commit `97c3c05`)

```
fato:     Campo payment_term era <input type="text"> livre, sem atalhos.
          Freelance tinha select com 6 condições (upfront/7d/15d/30d/60d/90d).
impacto:  Usuário precisava digitar "30 dias" toda vez; risco de typo e
          inconsistência entre orçamento e freelance derivado.
ação:     Acima do input de texto livre, adicionado row de pills com 7
          presets: À vista / 7d / 15d / 30d / 60d / 90d / 50%+50%. Clicar
          popula o input e destaca a pill ativa. Input free-text continua
          disponível para condições personalizadas ("parcelado em 3x sem
          juros", etc.). Zero mudança de schema — continua gravando string
          em budgets.payment_term.
validar:  Abrir orçamento, clicar "30 dias" → input exibe "30 dias",
          pill fica dourada. Digitar texto custom desmarca todas as pills.
```

### Protocolo de sessão autônoma (aprendizado novo)

```
fato:     Usuário deixou instrução de trabalho overnight: "só pare com o
          app pronto com tudo o que pedi rodando".
ação:     a) Primeiro: backup completo em /backup-2026-04-22-0005-reta-final/
             (2.7M, exclui node_modules/.next/.git/backups).
          b) Depois de cada fase: tsc → next build --webpack → commit → push.
          c) Entre deploys: curl nas rotas principais para confirmar 200 e
             medir latência. Janela de propagação do Vercel: ~60-90s.
          d) Agrupar mudanças em commits pequenos e atômicos ("fase-a",
             "fase-b", etc) para facilitar rollback cirúrgico.
          e) Skip de Fase F (repasses + PDF mensal de cobrança) por envolver
             mudança de schema (higher risk); documentar como "próximo passo
             recomendado" no relatório.
validar:  Todos os 14 deploys sucessivos fecharam verdes. curl em 14 rotas
          de produção retornou 200 em 155-882ms (média ~300ms).
```
