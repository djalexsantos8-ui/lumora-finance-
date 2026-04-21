# Setup — Aplicar Migrations no Supabase

> **Status atual:** a CI `Supabase Migrate` está falhando porque os secrets
> `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` não
> estão configurados no GitHub. Enquanto isso não for resolvido, as migrations
> precisam ser aplicadas manualmente via o SQL Editor do Supabase.

## O que aplicar AGORA (ações manuais)

Duas migrations novas precisam rodar pra os módulos **Pedidos** e
**Receita Recorrente** funcionarem:

1. `supabase/migrations/20260421021456_orders.sql` — cria `public.orders`
2. `supabase/migrations/20260421021500_recurring_revenue.sql` — cria `public.recurring_revenue`

Ambas são **idempotentes** (`CREATE TABLE IF NOT EXISTS` + `DROP POLICY IF EXISTS` +
validação por bloco `DO`). Podem ser rodadas múltiplas vezes sem quebrar nada.

### Passo a passo

1. Abra **https://supabase.com/dashboard/project/ajmbzzaiinowpmkxnism/sql/new**
   (substitua o project-ref se estiver em outro projeto)
2. Cole o conteúdo de `supabase/migrations/20260421021456_orders.sql`
3. Clique em **Run** (atalho `Cmd+Enter` no Mac)
4. Confira o resultado: deve aparecer `OK: orders table + triggers + RLS prontos`
5. Repita para `supabase/migrations/20260421021500_recurring_revenue.sql`
6. Pronto — as rotas `/pedidos` e `/receitas-recorrentes` passam a funcionar

### Como validar que deu certo

No SQL Editor, rode:

```sql
select table_name
from   information_schema.tables
where  table_schema = 'public'
  and  table_name in ('orders', 'recurring_revenue');
```

Deve retornar 2 linhas.

## Consertar a CI definitivamente (opcional, mas recomendado)

Para as próximas migrations irem automaticamente, configure no GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

Criar três secrets:

| Nome                     | Onde pegar                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `SUPABASE_PROJECT_REF`   | `ajmbzzaiinowpmkxnism` (o slug do projeto — aparece na URL do dashboard)                    |
| `SUPABASE_ACCESS_TOKEN`  | https://supabase.com/dashboard/account/tokens → **Generate new token** (dê escopo "all")    |
| `SUPABASE_DB_PASSWORD`   | A senha do banco que você definiu ao criar o projeto. Se esqueceu: **Settings → Database → Reset database password** |

Depois disso, todo push em `main` que mexa em `supabase/migrations/*.sql`
aplica automaticamente.

## Padrão de segurança

Todas as migrations do projeto seguem o mesmo padrão:

- `CREATE TABLE IF NOT EXISTS` — nunca derruba tabela existente
- `DROP POLICY IF EXISTS` antes de `CREATE POLICY` — idempotente
- Bloco `DO $$ … END $$` final com `raise exception` se algo não foi criado —
  o script falha RUIDOSAMENTE se o estado final não bater com o esperado

Então rodar várias vezes é seguro.
