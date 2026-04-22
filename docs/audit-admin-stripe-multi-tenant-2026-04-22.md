# Auditoria — Admin + Stripe + Multi-tenant (2026-04-22)

Sessão noturna. Usuário dormindo. Escopo: fase 1 de um pedido maior (login multi-usuário, isolamento de dados, Stripe pronto para vender, cupons e área admin).

Esta auditoria é ponto-de-partida: registra **estado real atual** vs **gaps** antes de qualquer mudança.

---

## 1. ESTADO ATUAL — resumo executivo

**✅ O que já funciona:**

1. **Auth** — Signup/login/forgot-password implementados via Supabase SSR.
2. **Proxy/middleware** (`src/proxy.ts` → `src/lib/supabase/middleware.ts`): rotas públicas, auth guard, subscription guard com bypass para `/upgrade`, `/api/stripe`, `/api/auth`, e *override* via `admin_grants`.
3. **Criação automática pós-signup** (`handle_new_user()` trigger em `auth.users`): cria `profile` + `workspace` + `workspace_member` (role=owner, status=active) + `subscription` (status=trialing, trial_ends_at = now + 7 dias). ✅ Multi-tenant auto-provisioning OK.
4. **RLS** — habilitado em **todas** as 31 tabelas public. Policies scopam por `workspace_members` (workspace_id + user_id + status='active'). Isolamento entre tenants confirmado na inspeção das policies críticas: `budgets`, `clients`, `contracts`, `orders`, `recurring_revenue`, `freelancers`, `jobs`, `expenses`, `fixed_costs`, `workspace_settings`, `job_*`, `order_*`.
5. **Stripe checkout** (`/api/stripe/checkout`): cria/reusa customer, chama `checkout.sessions.create` com `trial_period_days: 7` e `trial_settings.missing_payment_method: 'pause'`.
6. **Stripe webhook** (`/api/stripe/webhook`): assina via `STRIPE_WEBHOOK_SECRET`, trata `customer.subscription.{created,updated,paused,deleted}`, `invoice.payment_{succeeded,failed}` com upsert em `subscriptions` (onConflict user_id).
7. **Tabelas base para billing/admin já existem no banco:**
   - `subscriptions` (status, plan, trial_ends_at, current_period_*, stripe_subscription_id, stripe_customer_id)
   - `admin_grants` (email, user_id, grant_type, expires_at)
   - `coupon_codes` (code, discount_type, discount_value, duration, duration_months, max_uses, use_count, is_active, affiliate_id, stripe_coupon_id)
   - `coupon_usages` (coupon_id, user_id, stripe_discount_id)
   - `affiliates` (nome, commission_type, commission_value, total_referrals, is_active)
8. **Env vars configuradas** (local e Vercel esperado): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRODUCT_ID`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`.

**⚠️ Gaps identificados:**

1. **Área admin não existe como rota** — nenhum arquivo em `src/app/(app)/admin/` ou `src/app/admin/`. Apenas o hook do middleware faz lookup em `admin_grants`. Não há UI admin, listagem de users, KPIs, gerenciamento de cupons.
2. **Nenhum `admin_grant` existe em produção** — zero linhas na tabela. Owner (`djalexsantos8@gmail.com`) só entra porque o status legacy `subscription.status='trialing'` ainda permite passagem pelo guard (embora trial esteja expirado no calendário, o valor no banco não foi atualizado porque nunca houve Stripe subscription real).
3. **Conflito de preço** — instruções mais recentes do usuário mencionam **R$59,90/mês** e **R$599,00/ano**. Memória (`stripe_config.md`) e env atual apontam para **R$19,90/mês** (`price_1TJ2C0JPhM2pUhjm7fQrAExv`) e **R$149,90/ano** (`price_1TJ2C0JPhM2pUhjmDGn0J1ar`). **Decisão pendente do usuário** — não alterado nesta sessão.
4. **Cupons não têm fluxo de aplicação no checkout** — `/api/stripe/checkout` não aceita nem valida código de cupom; não existe server action para validar cupom antes de redirecionar para o Stripe; `coupon_usages` nunca é populada pela app.
5. **Promotion codes no Stripe não existem ainda** — só produto e preços mensal/anual. Não foram criados `coupons` nem `promotion_codes` no Stripe.
6. **Link/UI `sem cartão no trial`** — decisão antiga de memória menciona "7 dias grátis sem cartão". Implementação atual do checkout força `payment_method_types: ['card']`, ou seja, cartão exigido no checkout. Não é um bug — é uma discrepância de decisão vs implementação que o usuário precisa validar.
7. **Status da subscription pode ficar obsoleto em DEV** — usuários legados (Eduardo, Alexandrino) têm `status='trialing'` mas `trial_ends_at` no passado (07/dias < hoje). Não afeta usuários reais que passarão pelo fluxo Stripe, mas vale um cron ou job diário de cleanup no futuro.

**Não são problemas (falsos alarmes):**

- `contracts_insert` com `qual=null` — é correto para `FOR INSERT`: PostgreSQL usa apenas `WITH CHECK`, que está preenchido corretamente (workspace membership + created_by = auth.uid()).
- Policies `FOR ALL` sem `with_check` — PostgreSQL usa `qual` como `WITH CHECK` quando não fornecido. Seguro.

---

## 2. DADOS EM PRODUÇÃO (snapshot 2026-04-22)

- **Profiles**: 2 (Eduardo Castilho; Alexandrino — owner)
- **Subscriptions**: 2 (ambos `trialing`, sem stripe_subscription_id ainda — trial local expirado mas DB desatualizado)
- **Admin grants**: 0
- **Coupon codes**: (não auditado — provável 0)
- **Affiliates**: (não auditado — provável 0)

---

## 3. DECISÕES E PENDÊNCIAS PARA O USUÁRIO

### Bloqueio **crítico** para lançar vendendo hoje:

**D1 — Qual preço vale? R$19,90/149,90 (memória/env) OU R$59,90/599,00 (pedido novo)?**
- Se R$59,90/599,00: precisamos criar novos `prices` no Stripe, atualizar env vars, e deixar os antigos inativos (mas arquivados — não deletar).
- Se R$19,90/149,90: manter como está; só seguir com UI/admin.
- **Não altero até decisão do usuário**. Manter env atual evita quebrar checkout.

**D2 — Trial com ou sem cartão?**
- Atual: cartão exigido no checkout (pausa se payment method inválido após trial).
- Memória antiga: trial sem cartão nos primeiros 7 dias.
- Recomendação: manter com cartão (padrão SaaS moderno, reduz churn de contas fantasma, ativa billing imediatamente). Usuário decide.

### Para rodar após D1 definido:

**D3 — Criar admin_grant permanente para o owner (`djalexsantos8@gmail.com`)**
- Isso garante acesso ao app e à área admin mesmo com subscription expirada.
- Tipo sugerido: `lifetime` ou `founder`.

**D4 — Criar cupons iniciais no Stripe para teste**
- Ex: `INFLUENCER1MONTH` (1 mês grátis), `INFLUENCER3MONTHS` (3 meses grátis), `FRIENDS50` (50% off primeiro mês).

---

## 4. ESCOPO DESTA SESSÃO (o que **vai ser feito** sem depender de decisão do usuário)

1. Criar rota `/admin` protegida por `admin_grants` (redirect caso não seja admin).
2. Dashboard KPIs (contagens: users, trials, active subs, recent signups, coupon usages).
3. Listagem de usuários com email, data, status, plano.
4. Listagem de cupons (read-only inicial; CRUD pode vir numa rodada futura).
5. Adicionar link "Admin" na sidebar apenas para admins (verificação via query client-side ou Server Component).
6. Ajustar `proxy.ts` para incluir `/admin` entre rotas que respeitam o bypass via admin_grant (já deve funcionar, mas validar).
7. Commit + push para Vercel. Test de build local antes do push.

**NÃO faz nesta sessão:**
- Atualizar preços Stripe (depende de D1).
- Criar cupons no Stripe (depende de D4 e de UI de CRUD).
- Refatorar auth/RLS (funcionando bem).
- Criar fluxo de aplicação de cupom no checkout (depende de D1 e decisão de UX).
- Alterar trigger `handle_new_user`.
- Touch em qualquer tabela financeira operacional (risk-off).

---

## 5. REGRAS QUE ESTOU SEGUINDO

- **Sem quebrar.** Qualquer mudança com potencial de impactar usuários em produção exige backup e review.
- **Pequenos commits.** Cada commit compilável, testável isoladamente.
- **Não deletar dados.** Apenas INSERT/UPDATE defensivos.
- **Não rodar migrations destrutivas.** Apenas aditivas (novas tabelas/colunas).
- **Documentar tudo.** Este arquivo é a fonte da verdade desta sessão + commits conterão contexto.

---

## 6. REFERÊNCIAS RÁPIDAS

- Proxy/middleware: `src/proxy.ts` + `src/lib/supabase/middleware.ts`
- Stripe checkout: `src/app/api/stripe/checkout/route.ts`
- Stripe webhook: `src/app/api/stripe/webhook/route.ts`
- Schema atual: `supabase/schema.sql` + migrations em `supabase/migrations/`
- Supabase project id: `ajmbzzaiinowpmkxnism`
- Stripe mode: TEST
- Stripe product: `prod_UHbOEr4jkFw3Bl`
