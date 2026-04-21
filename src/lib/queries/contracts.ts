// ─── Queries de contratos (somente leitura, chamadas de Server Components) ──
//
// Separado de `lib/actions/contracts.ts` porque aquele arquivo tem diretiva
// `'use server'` — que transforma todos os exports em Server Actions. Server
// Actions chamadas DURANTE o render de um Server Component no Next 16 podem
// se comportar de forma diferente de funções server "normais" (especialmente
// com Turbopack). Manter as leituras como funções async comuns evita qualquer
// sobrecarga de boundary e é mais seguro contra crash de render.

import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type {
  Contract,
  ContractOriginKind,
} from '@/types/contract'

// ─── listContractsByOriginQuery ────────────────────────────────────────────

export async function listContractsByOriginQuery(
  originKind: ContractOriginKind,
  originId: string
): Promise<Contract[]> {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return []

    const workspaceId = await getWorkspaceId(userData.user.id)
    if (!workspaceId) return []

    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('origin_kind', originKind)
      .eq('origin_id', originId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      // Tabela contracts pode não existir se migration 20260421130000
      // ainda não rodou em algum ambiente — degrada silenciosamente.
      console.warn('[listContractsByOriginQuery] query error:', error.message)
      return []
    }
    return (data || []) as unknown as Contract[]
  } catch (err) {
    // Qualquer falha (rede, RLS, parse) retorna lista vazia para não derrubar
    // a página da entidade (budget/freelance/order/recurring).
    console.error('[listContractsByOriginQuery] unexpected error:', err)
    return []
  }
}

// ─── listContractsQuery ────────────────────────────────────────────────────

export async function listContractsQuery(): Promise<Contract[]> {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return []

    const workspaceId = await getWorkspaceId(userData.user.id)
    if (!workspaceId) return []

    const { data, error } = await supabase
      .from('contracts')
      .select('*, client:clients(*)')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[listContractsQuery] query error:', error.message)
      return []
    }
    return (data || []) as unknown as Contract[]
  } catch (err) {
    console.error('[listContractsQuery] unexpected error:', err)
    return []
  }
}

// ─── getContractQuery ──────────────────────────────────────────────────────

export async function getContractQuery(id: string): Promise<Contract | null> {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return null

    const workspaceId = await getWorkspaceId(userData.user.id)
    if (!workspaceId) return null

    const { data, error } = await supabase
      .from('contracts')
      .select('*, client:clients(*)')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      console.warn('[getContractQuery] query error:', error.message)
      return null
    }
    return (data as unknown as Contract) || null
  } catch (err) {
    console.error('[getContractQuery] unexpected error:', err)
    return null
  }
}
