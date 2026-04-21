'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { normalizeName, cleanName, validateClientName } from '@/lib/utils/normalize-name'
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

// ─── quickCreateClient — criação rápida (só nome) via ClientField ────────────
//
// Wrapper com auth em volta de getOrCreateClient.
// Idempotente: se já existe cliente com mesmo name_normalized no workspace,
// retorna o existente — o ClientField trata como seleção normal.
//
// Usado exclusivamente pela row "Criar rápido" do dropdown do ClientField.

export async function quickCreateClient(
  rawName: string
): Promise<ClientActionResult> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  // Validação centralizada — bloqueia "a", "1", "12", ".", etc.
  const v = validateClientName(rawName)
  if (!v.valid) return { success: false, message: v.message! }

  // Idempotente por construção (getOrCreateClient). Se já existe match exato
  // por name_normalized, retorna o existente — sem criar duplicata.
  const client = await getOrCreateClient(workspaceId, v.cleaned)
  if (!client) return { success: false, message: 'Não foi possível criar o cliente.' }

  revalidatePath('/clientes')
  return { success: true, data: client }
}

// ─── createClientFull — criação completa (nome + dados opcionais) ────────────
//
// Usado pelo modal "Criar com dados completos" do ClientField.
// Em caso de duplicidade por name_normalized, retorna `duplicate: Client` para
// que a UI ofereça merge (adicionar dados ao cliente existente) sem descartar
// o que o usuário preencheu.

export type CreateClientFullResult =
  | { success: true;  data: Client }
  | { success: false; duplicate: Client; message: string }
  | { success: false; message: string }

export async function createClientFull(
  draft: {
    name:       string
    phone?:     string | null
    instagram?: string | null
    email?:     string | null
    document?:  string | null
    notes?:     string | null
  }
): Promise<CreateClientFullResult> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  // Validação centralizada — mesma regra do quickCreateClient.
  const v = validateClientName(draft.name)
  if (!v.valid) return { success: false, message: v.message! }

  const name = v.cleaned
  const normalized = normalizeName(name)

  // 1. Checa duplicata ANTES de inserir — se existe, devolve pra UI oferecer merge
  const { data: existing } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name_normalized', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      duplicate: existing as Client,
      message: `Já existe um cliente chamado "${(existing as Client).name}".`,
    }
  }

  // 2. Cria
  const payload: Record<string, unknown> = {
    workspace_id:    workspaceId,
    name,
    name_normalized: normalized,
    phone:     draft.phone?.trim()     || null,
    instagram: draft.instagram?.trim() || null,
    email:     draft.email?.trim()     || null,
    document:  draft.document?.trim()  || null,
    notes:     draft.notes?.trim()     || null,
  }

  const { data, error } = await supabase
    .from('clients')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    // Race condition — alguém criou entre o check e o insert.
    if (error.code === '23505') {
      const { data: afterRace } = await supabase
        .from('clients')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('name_normalized', normalized)
        .is('deleted_at', null)
        .maybeSingle()
      if (afterRace) {
        return {
          success: false,
          duplicate: afterRace as Client,
          message: `Já existe um cliente chamado "${(afterRace as Client).name}".`,
        }
      }
    }
    console.error('[clients/create-full]', error)
    return { success: false, message: 'Erro ao criar cliente.' }
  }

  revalidatePath('/clientes')
  return { success: true, data: data as Client }
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

// ─── bulkDeleteClients — soft delete em lote ─────────────────────────────────
//
// Mesmo padrão de budgets/orders. Soft delete; jobs seguem referenciando
// por client_id (não afeta dashboard/histórico).

export async function bulkDeleteClients(
  ids: string[]
): Promise<{ success: boolean; count: number; message?: string }> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, count: 0, message: 'Não autorizado.' }

  if (!ids || ids.length === 0) return { success: true, count: 0 }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, count: 0, message: 'Workspace não encontrado.' }

  const { data, error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[clients/bulk-delete]', error)
    return { success: false, count: 0, message: 'Erro ao remover clientes.' }
  }

  revalidatePath('/clientes')
  return { success: true, count: data?.length ?? 0 }
}
