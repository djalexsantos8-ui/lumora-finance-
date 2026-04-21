# Setup — Aplicar Migrations no Supabase

> **Status atual:** a CI `Supabase Migrate` está falhando porque os secrets
> `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` não
> estão configurados no GitHub. Enquanto isso não for resolvido, as migrations
> precisam ser aplicadas manualmente via o SQL Editor do Supabase.

## O que aplicar AGORA (ações manuais)

A migration consolidada (Blueprint 2026-04-21) adiciona items/cost items/files
a Pedidos, expande Receita Recorrente e habilita o fluxo completo do V1:

1. **`supabase/migrations/20260421040000_orders_full_schema.sql`** ← aplique esta
   - Cria/atualiza `public.orders` com todos os campos novos
     (project_description, deliverables, lead_source, client_segment,
     notes_internal, payment_condition, event_date, order_date_start/end…)
   - Cria `public.order_items` (linhas de venda que vão pro PDF)
   - Cria `public.order_cost_items` (custos internos)
   - Cria `public.order_files` + bucket `order-files` no Storage
   - Cria `public.recurring_revenue` com campos estendidos
   - Triggers de rollup (`revenue_total` / `cost_total` em orders)
   - RLS por workspace_members + soft delete em tudo

Até essa migration ser aplicada, o app continua funcionando normalmente
**porque há degradação graciosa**: seções ausentes mostram um banner
"Migration pendente" ao invés de quebrar. Nenhuma rota retorna 500.

### Passo a passo

1. Abra **https://supabase.com/dashboard/project/ajmbzzaiinowpmkxnism/sql/new**
   (substitua o project-ref se estiver em outro projeto)
2. Cole o conteúdo de `supabase/migrations/20260421040000_orders_full_schema.sql`
3. Clique em **Run** (atalho `Cmd+Enter` no Mac)
4. Aguarde a mensagem de sucesso. Pode demorar alguns segundos porque cria
   várias tabelas + triggers + policies.
5. Pronto — o fluxo completo de Pedidos (items, custos, arquivos, PDF) passa
   a funcionar.

### Como validar que deu certo

No SQL Editor, rode:

```sql
select table_name
from   information_schema.tables
where  table_schema = 'public'
  and  table_name in (
    'orders', 'order_items', 'order_cost_items', 'order_files',
    'recurring_revenue'
  );
```

Deve retornar 5 linhas.

Valide também o bucket Storage:

**Supabase Dashboard → Storage** deve conter um bucket chamado `order-files`.

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
