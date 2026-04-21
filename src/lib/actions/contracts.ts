'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { resolveContractContext } from '@/lib/contracts/resolver'
import { renderContract, canGenerate } from '@/lib/contracts/render'
import { getContractMeta } from '@/lib/contracts/catalog'
import type {
  Contract,
  ContractActionResult,
  ContractListResult,
  ContractMetadata,
  ContractOriginKind,
  ContractStatus,
  ContractType,
} from '@/types/contract'

// ═══ listContracts ═══════════════════════════════════════════════════════════

export async function listContracts(): Promise<ContractListResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  const { data, error } = await supabase
    .from('contracts')
    .select('*, client:clients(*)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return { success: false, message: error.message }
  return { success: true, data: (data || []) as unknown as Contract[] }
}

// ═══ listContractsByOrigin (vínculo reverso) ════════════════════════════════

export async function listContractsByOrigin(
  originKind: ContractOriginKind,
  originId: string
): Promise<ContractListResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('origin_kind', originKind)
    .eq('origin_id', originId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return { success: false, message: error.message }
  return { success: true, data: (data || []) as unknown as Contract[] }
}

// ═══ getContract ════════════════════════════════════════════════════════════

export async function getContract(id: string): Promise<ContractActionResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  const { data, error } = await supabase
    .from('contracts')
    .select('*, client:clients(*)')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { success: false, message: error.message }
  if (!data) return { success: false, message: 'Contrato não encontrado' }
  return { success: true, data: data as unknown as Contract }
}

// ═══ createContractFromOrigin ═══════════════════════════════════════════════
//
// Entrada mais importante: cria um contrato já pré-resolvido a partir de uma
// entidade operacional. O usuário depois completa/revisa no Builder.

export async function createContractFromOrigin(params: {
  contractType: ContractType
  originKind:   ContractOriginKind
  originId:    string
}): Promise<ContractActionResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  const meta = getContractMeta(params.contractType)
  if (!meta) return { success: false, message: 'Tipo de contrato inválido' }

  // Resolve contexto
  const ctx = await resolveContractContext({
    workspaceId,
    contractType: params.contractType,
    originKind:   params.originKind,
    originId:     params.originId,
  })

  // Determina clientId a partir da origem
  const clientId = await resolveClientIdFromOrigin(
    supabase, workspaceId, params.originKind, params.originId
  )

  // Renderiza com o que tem (placeholders ausentes = sinalizados)
  const rendered = renderContract(ctx)
  const canGen = canGenerate(params.contractType, ctx.values)

  // Título: usa titulo_projeto resolvido, fallback para nome do tipo
  const title = ctx.values.titulo_projeto
    ? `${meta.title} — ${ctx.values.titulo_projeto}`
    : meta.title

  const metadata: ContractMetadata = {
    version: 1,
    values: ctx.values,
    missing: ctx.missing,
    origin_snapshot: {
      kind: params.originKind,
      id:   params.originId,
      label: title,
    },
  }

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      workspace_id:     workspaceId,
      created_by:       userData.user.id,
      contract_type:    params.contractType,
      title,
      origin_kind:      params.originKind,
      origin_id:        params.originId,
      client_id:        clientId,
      status:           canGen.ok ? 'generated' : 'draft',
      rendered_content: rendered.markdown,
      metadata,
      generated_at:     canGen.ok ? new Date().toISOString() : null,
    })
    .select('*, client:clients(*)')
    .single()

  if (error) return { success: false, message: error.message }

  revalidatePath('/contracts')
  revalidatePath(`/${originPathSegment(params.originKind)}/${params.originId}`)

  return { success: true, data: data as unknown as Contract }
}

// ═══ createStandaloneContract ═══════════════════════════════════════════════

export async function createStandaloneContract(
  contractType: ContractType
): Promise<ContractActionResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  const meta = getContractMeta(contractType)
  if (!meta) return { success: false, message: 'Tipo de contrato inválido' }

  const ctx = await resolveContractContext({
    workspaceId,
    contractType,
  })
  const rendered = renderContract(ctx)

  const metadata: ContractMetadata = {
    version: 1,
    values: ctx.values,
    missing: ctx.missing,
    origin_snapshot: { kind: 'standalone', id: null, label: meta.title },
  }

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      workspace_id:     workspaceId,
      created_by:       userData.user.id,
      contract_type:    contractType,
      title:            meta.title,
      origin_kind:      'standalone',
      status:           'draft',
      rendered_content: rendered.markdown,
      metadata,
    })
    .select('*, client:clients(*)')
    .single()

  if (error) return { success: false, message: error.message }

  revalidatePath('/contracts')
  return { success: true, data: data as unknown as Contract }
}

// ═══ updateContract ═════════════════════════════════════════════════════════
//
// Usado pelo Builder quando o usuário edita valores manualmente. Recalcula o
// markdown renderizado e atualiza metadata.

export async function updateContract(
  id: string,
  patch: {
    title?:          string
    status?:         ContractStatus
    notes_internal?: string
    /** Overrides manuais — sobrescrevem valores auto-resolvidos */
    overrides?:      Record<string, string>
    /** Se passado, força client_id */
    client_id?:      string | null
    /** Se true, re-renderiza o contrato com overrides aplicados */
    regenerate?:     boolean
    /** Se true, sobrescreve rendered_content direto (edição manual do texto) */
    rendered_content?: string
  }
): Promise<ContractActionResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  // Busca o contrato atual
  const { data: current } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!current) return { success: false, message: 'Contrato não encontrado' }

  const payload: Record<string, unknown> = {}

  if (patch.title !== undefined)          payload.title = patch.title
  if (patch.status !== undefined)         payload.status = patch.status
  if (patch.notes_internal !== undefined) payload.notes_internal = patch.notes_internal
  if (patch.client_id !== undefined)      payload.client_id = patch.client_id

  // Se regenerate → re-resolve + re-renderiza
  if (patch.regenerate) {
    const currentMeta = (current.metadata || {}) as ContractMetadata
    const mergedOverrides = {
      ...(currentMeta.overrides || {}),
      ...(patch.overrides || {}),
    }

    const ctx = await resolveContractContext({
      workspaceId,
      contractType: current.contract_type as ContractType,
      originKind:   current.origin_kind as ContractOriginKind | null,
      originId:     current.origin_id,
      clientId:     patch.client_id !== undefined ? patch.client_id : current.client_id,
      overrides:    mergedOverrides,
    })

    const rendered = renderContract(ctx)
    const canGen = canGenerate(current.contract_type as ContractType, ctx.values)

    payload.rendered_content = rendered.markdown
    payload.metadata = {
      ...currentMeta,
      version: 1,
      values: ctx.values,
      missing: ctx.missing,
      overrides: mergedOverrides,
    }

    if (current.status === 'draft' && canGen.ok) {
      payload.status = 'generated'
      payload.generated_at = new Date().toISOString()
    }
  } else if (patch.rendered_content !== undefined) {
    payload.rendered_content = patch.rendered_content
  }

  const { data, error } = await supabase
    .from('contracts')
    .update(payload)
    .eq('id', id)
    .select('*, client:clients(*)')
    .single()

  if (error) return { success: false, message: error.message }

  revalidatePath('/contracts')
  revalidatePath(`/contracts/${id}`)
  if (current.origin_kind && current.origin_id) {
    revalidatePath(`/${originPathSegment(current.origin_kind as ContractOriginKind)}/${current.origin_id}`)
  }

  return { success: true, data: data as unknown as Contract }
}

// ═══ deleteContract (soft) ══════════════════════════════════════════════════

export async function deleteContract(id: string): Promise<ContractActionResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { success: false, message: 'Não autenticado' }

  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado' }

  const { data, error } = await supabase
    .from('contracts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) return { success: false, message: error.message }

  revalidatePath('/contracts')
  return { success: true, data: data as unknown as Contract }
}

// ─── helpers internos ──────────────────────────────────────────────────────

async function resolveClientIdFromOrigin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  originKind: ContractOriginKind,
  originId: string
): Promise<string | null> {
  const tableMap: Partial<Record<ContractOriginKind, string>> = {
    budget:    'budgets',
    freelance: 'jobs',
    order:     'orders',
    recurring: 'recurring_revenue',
  }
  const table = tableMap[originKind]
  if (!table) return null

  const { data } = await supabase
    .from(table)
    .select('client_id')
    .eq('id', originId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  return data?.client_id || null
}

function originPathSegment(kind: ContractOriginKind): string {
  switch (kind) {
    case 'budget':    return 'budgets'
    case 'freelance': return 'freelances'
    case 'order':     return 'pedidos'
    case 'recurring': return 'receitas-recorrentes'
    default:          return 'contracts'
  }
}
