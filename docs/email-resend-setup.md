# Email — Configuração Resend + Supabase Auth

> **Status:** AÇÃO MANUAL PENDENTE — precisa ser feito por você, Leleco, nos painéis
> do Supabase, Resend e do provedor de DNS do domínio `lumora.solutions`.
> O Claude Code não tem acesso a esses consoles.

## Por que configurar

Hoje os e-mails de cadastro e reset de senha saem pelo SMTP padrão do Supabase
(`noreply@mail.app.supabase.io`). Isso cai em spam com frequência e não é branded.
Com Resend conectado via SMTP custom, os e-mails saem de `noreply@lumora.solutions`,
com SPF/DKIM/DMARC válidos.

## Pré-requisitos

- [ ] Conta no Resend (https://resend.com) — o plano gratuito (100 e-mails/dia) cobre
      o período de beta tranquilamente
- [ ] Acesso ao painel de DNS de `lumora.solutions`
- [ ] Acesso ao projeto Supabase do Lumora Finance

---

## Passo 1 — Adicionar domínio no Resend

1. Acesse https://resend.com/domains
2. Clique em **Add Domain**
3. Digite `lumora.solutions` (sem `https://`, sem subdomínio)
4. Escolha a região mais próxima (`us-east-1` é padrão e funciona bem)
5. Clique em **Add**

Resend vai mostrar 3 registros DNS que precisam ser adicionados:

- **1 registro TXT (SPF / domain verification)** — prova que o domínio é seu
- **2 registros DKIM (CNAME ou TXT)** — assinam os e-mails
- **1 registro DMARC opcional (TXT)** — política de rejeição de e-mails falsos

## Passo 2 — Adicionar os registros DNS

No painel do provedor de domínio (Registro.br, Cloudflare, GoDaddy, etc):

1. Abra a zona DNS de `lumora.solutions`
2. Para cada registro que o Resend mostrar, adicione:
   - **Tipo:** o que o Resend pediu (TXT, CNAME)
   - **Nome/Host:** o valor exato que o Resend mostrou
     - Exemplo: `resend._domainkey.lumora.solutions` ou só `resend._domainkey`
     - ⚠️ Alguns provedores adicionam `.lumora.solutions` automaticamente — nesse
       caso cole só `resend._domainkey`
   - **Valor/Conteúdo:** o valor longo (começa com `v=spf1...` ou `p=...`)
   - **TTL:** deixe no padrão (300s ou 1h)
3. Salve
4. Volte ao Resend e clique em **Verify DNS Records**
5. Propagação pode levar 5min a 24h. Se não verificar na hora, espere 30min e tente de novo.

## Passo 3 — Pegar credenciais SMTP do Resend

1. No Resend, vá em https://resend.com/settings/smtp
2. Copie:
   - **SMTP Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) ou `587` (TLS) — use **465**
   - **Username:** `resend`
   - **Password:** clique em **Create API Key**, dê um nome como `lumora-smtp-prod`,
     copie o valor (começa com `re_...`). **Salve em local seguro — só aparece uma vez.**

## Passo 4 — Configurar SMTP no Supabase

1. Abra o projeto no Supabase: https://supabase.com/dashboard/project/_/auth/providers
2. Role até **SMTP Settings** e clique em **Enable Custom SMTP**
3. Preencha:
   - **Sender email:** `noreply@lumora.solutions`
   - **Sender name:** `Lumora Finance`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** a API key do Resend (`re_...`)
4. Clique em **Save**
5. Clique em **Send test email** para validar — o e-mail precisa chegar na caixa
   de entrada (não spam). Se cair no spam, espere mais tempo para o DNS propagar
   ou confira se os 3 registros estão verdes no Resend.

## Passo 5 — Ajustar templates de e-mail no Supabase

1. Ainda em Authentication, vá em **Email Templates**
2. Personalize pelo menos o template **Confirm signup**:
   - **Subject:** `Confirme seu e-mail no Lumora Finance`
   - **Body:** use HTML simples (Supabase aceita Markdown básico + `{{ .ConfirmationURL }}`)

   Sugestão de body:

   ```html
   <h2>Bem-vindo ao Lumora Finance</h2>
   <p>Clique no link abaixo para confirmar seu e-mail e entrar no seu workspace:</p>
   <p><a href="{{ .ConfirmationURL }}">Confirmar e-mail</a></p>
   <p>Se você não criou esta conta, ignore este e-mail.</p>
   <p>— Equipe Lumora Finance</p>
   ```

3. Personalize também **Reset password** e **Magic link** se forem usados

## Passo 6 — Validar end-to-end

1. Abra o app em produção (https://lumora.solutions)
2. Crie uma conta nova com um e-mail que você tenha acesso (pode ser outro Gmail seu)
3. O e-mail deve chegar:
   - ✅ Na caixa de entrada (não spam)
   - ✅ Remetente `Lumora Finance <noreply@lumora.solutions>`
   - ✅ Com o link funcionando
4. Clique em **Já confirmei, voltar ao login** — o novo botão dourado leva direto para `/login`
5. Depois de confirmar o e-mail, entre com as credenciais e valide que cai em `/dashboard`

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Resend não verifica DNS | DNS ainda propagando | Esperar 30min, tentar de novo |
| E-mail cai no spam | DKIM não validado | Conferir os 3 registros do Resend em verde |
| Supabase erro "SMTP connection failed" | Porta errada ou senha incorreta | Porta **465** e senha = API key completa (com `re_`) |
| E-mail não chega | Rate limit Supabase | Plano free Supabase limita a ~3 e-mails/hora sem SMTP custom. Com Resend, limite sobe para 100/dia no free Resend |

## Custos

- **Resend Free:** 100 e-mails/dia, 3.000/mês (cobre beta + primeiros clientes pagos)
- **Resend Pro:** $20/mês por 50.000 e-mails — considerar quando passar de 100 signups/dia

## Arquivos relacionados no código

- `src/app/(auth)/signup/page.tsx` — agora com botão "Já confirmei, voltar ao login" no success state
- `src/app/(auth)/forgot-password/page.tsx` — já tem link "Voltar para o login"
- `src/app/api/auth/callback/route.ts` — recebe o link clicado e confirma a sessão

---

**Última revisão:** 2026-04-23
