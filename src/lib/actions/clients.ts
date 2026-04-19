'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { normalizeName, cleanName } from '@/lib/utils/normalize-name'
import type {
  Client,
  ClientActionResult,
  ClientListResult,
  ClientSearchItem,
  ClientSearchResult,
} from '@/types/client'

// ─── getOrCreateClient ───────────────────────────────────────────────────────
//
// Idempotente. Zero fricção.
//
//   1. normaliza(name)
//   2. se já existe no workspace (e não deletado) → retorna
//   3. se não existe → insert; se esbarrar em UNIQUE (race), re-busca e retorna
//
// Chamado por updateJob sempre que o usuário digita um nome de cliente.
// Deduplicação: a UNIQUE (workspace_id, name_normalized) é a fonte da verdade.

export async function getOrCreateClient(
  workspaceId: string,
  rawName:     string
): Promise<Client | null> {
  const name = cleanName(rawName)
  if (!name) return null

  const normalized = normalizeName(name)
  if (!normalized) return null

  const supabase = await createSupabase()

  // 1. Busca existente
  const { data: existing } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name_normalized', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) return existing as Client

  // 2. Cria novo
  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      workspace_id:    workspaceId,
      name,
      name_normalized: normalized,
    })
    .select('*')
    .single()

  if (!error && created) return created as Client

  // 3. Race condition — outra requisição criou antes. Re-busca.
  const { data: afterRace } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name_normalized', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  return (afterRace as Client | null) ?? null
}

// ─── searchClients — para autocomplete ───────────────────────────────────────
//
// Busca clientes do workspace do usuário autenticado.
// `query` já deve vir do client normalizado ou cru — re-normalizamos aqui.

export async function searchClients(query: string): Promise<ClientSearchResult> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const q = normalizeName(query)

  let builder = supabase
    .from('clients')
    .select('id, name, name_normalized')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(12)

  if (q) {
    // ilike no name_normalized cobre casos como "jo" → "joao", "ana"
    builder = builder.ilike('name_normalized', `%${q}%`)
  }

  const { data, error } = await builder

  if (error) {
    console.error('[clients/search]', error)
    return { success: false, message: 'Erro ao buscar clientes.' }
  }

  return { success: true, data: (data ?? []) as ClientSearchItem[] }
}

// ─── listClients — listagem completa (aba /clientes) ─────────────────────────

export async function listClients(): Promise<ClientListResult> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (error) {
    console.error('[clients/list]', error)
    return { success: false, message: 'Erro ao listar clientes.' }
  }

  return { success: true, data: (data ?? []) as Client[] }
}

// ─── updateClient — edição de ficha ──────────────────────────────────────────
//
// Permite enriquecer os dados opcionais (phone, instagram, email, document,
// notes) e renomear. Renomear recalcula name_normalized.

export async function updateClient(
  id: string,
  fields: {
    name?:      string
    phone?:     string | null
    instagram?: string | null
    email?:     string | null
    document?:  string | null
    notes?:     string | null
  }
): Promise<ClientActionResult> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, message: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}

  if (fields.name !== undefined) {
    const n = cleanName(fields.name)
    if (!n) return { success: false, message: 'Nome não pode ficar vazio.' }
    payload.name = n
    payload.name_normalized = normalizeName(n)
  }
  if ('phone'     in fields) payload.phone     = fields.phone?.trim()     || null
  if ('instagram' in fields) payload.instagram = fields.instagram?.trim() || null
  if ('email'     in fields) payload.email     = fields.email?.trim()     || null
  if ('document'  in fields) payload.document  = fields.document?.trim()  || null
  if ('notes'     in fields) payload.notes     = fields.notes?.trim()     || null

  if (Object.keys(payload).length === 0)
    return { success: false, message: 'Nenhum campo para atualizar.' }

  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error) {
    console.error('[clients/update]', error)
    // Conflito de UNIQUE → nome duplicado
    if (error.code === '23505') {
      return { success: false, message: 'Já existe um cliente com esse nome.' }
    }
    return { success: false, message: 'Erro ao atualizar cliente.' }
  }

  revalidatePath('/clientes')
  return { success: true, data: data as Client }
}

// ─── deleteClient — soft delete ──────────────────────────────────────────────
//
// Não toca em jobs: jobs preservam client_id (FK on delete set null cascata no
// hard delete, mas aqui é soft). A ideia: cliente removido some da lista e do
// autocomplete, mas o histórico de jobs continua referenciando.

export async function deleteClient(id: string): Promise<{ success: boolean; message?: string }> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[clients/delete]', error)
    return { success: false, message: 'Erro ao remover cliente.' }
  }

  revalidatePath('/clientes')
  return { success: true }
}
