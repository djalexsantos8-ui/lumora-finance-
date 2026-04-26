#!/usr/bin/env bash
# =============================================================================
# RLS Test Runner — Lumora V2
# =============================================================================
# Roda a suite scripts/v2-test/rls-isolation.sql contra Supabase com 2 contas
# de teste reais. Substitui placeholders via sed e usa psql direto.
#
# Pré-requisitos no .env.local:
#   RLS_TEST_USER_A       — UUID do user A (rls-test-a@lumora.dev)
#   RLS_TEST_USER_B       — UUID do user B (rls-test-b@lumora.dev)
#   RLS_TEST_WORKSPACE_B  — workspace.id do B
#   SUPABASE_DB_URL       — connection string Postgres (service_role bypass NÃO usar)
#
# Como rodar:
#   bash scripts/v2-test/run-rls-tests.sh
#
# Saída:
#   - sucesso: imprime "✅ Suite RLS passou" + EXIT=0
#   - falha:   imprime erro do psql + EXIT≠0
# =============================================================================

set -euo pipefail

# Carrega .env.local se existir
if [ -f .env.local ]; then
  # shellcheck disable=SC2046,SC2002
  export $(cat .env.local | grep -E '^RLS_TEST_|^SUPABASE_DB_URL=' | xargs)
fi

UUID_A="${RLS_TEST_USER_A:-}"
UUID_B="${RLS_TEST_USER_B:-}"
WS_B="${RLS_TEST_WORKSPACE_B:-}"
DB_URL="${SUPABASE_DB_URL:-}"

# Validation
missing=()
[ -z "$UUID_A" ]  && missing+=("RLS_TEST_USER_A")
[ -z "$UUID_B" ]  && missing+=("RLS_TEST_USER_B")
[ -z "$WS_B" ]    && missing+=("RLS_TEST_WORKSPACE_B")
[ -z "$DB_URL" ]  && missing+=("SUPABASE_DB_URL")

if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ Variáveis faltando no .env.local:"
  for v in "${missing[@]}"; do echo "   - $v"; done
  echo ""
  echo "Setup inicial:"
  echo "  1. Criar 2 contas via /signup: rls-test-a@lumora.dev e rls-test-b@lumora.dev"
  echo "  2. SQL: select id, email from auth.users where email like 'rls-test-%@lumora.dev';"
  echo "  3. SQL: select id from workspaces where owner_id = '<UUID-B>';"
  echo "  4. Adicionar no .env.local"
  exit 1
fi

echo "🔒 Rodando RLS Isolation Suite..."
echo "   User A:       $UUID_A"
echo "   User B:       $UUID_B"
echo "   Workspace B:  $WS_B"
echo ""

# Substitui placeholders e pipa pro psql
sed -e "s|<UUID-A>|$UUID_A|g" \
    -e "s|<UUID-B>|$UUID_B|g" \
    -e "s|<workspace-B-id>|$WS_B|g" \
    scripts/v2-test/rls-isolation.sql \
  | psql "$DB_URL" \
        -v ON_ERROR_STOP=1 \
        --quiet \
        --no-psqlrc

echo ""
echo "✅ Suite RLS passou — todos os 4 testes retornaram esperado"
