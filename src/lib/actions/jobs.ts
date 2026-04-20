'use server'

/**
 * DEPLOY 3 — Fluxo de criação refatorado
 *
 * Removido:
 * - createJob (legacy redirect flow)
 * - createJobFromForm (/new form flow)
 *
 * Substituído por:
 * - createFreelanceDraft()
 *
 * Motivo:
 * - eliminar fricção
 * - alinhar com fluxo real do usuário
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { getErrorMessage } from '@/lib/errors/get-error-message'
import { getOrCreateClient } from '@/lib/actions/clients'
import { cleanName } from '@/lib/utils/normalize-name'
import type {
  JobStatus,
  JobType,
  JobCategory,
  PaymentCondition,
  JobActionResult,
  JobPaymentActionResult,
  JobWithPaymentsResult,
} from '@/types/job'

// ─── CREATE DRAFT — cria rascunho e devolve {id} sem redirecionar ─────────────
//
// Deploy 3: fluxo de criação direta. O botão "Novo Freelance" chama esta action
// e o cliente (Client Component) faz o router.push para /freelances/:id.
//
// Por que não reusar createJob? createJob é legado (órfão após Deploy 3) e
// redireciona internamente, o que impede o chamador de controlar a navegação.
// Mantemos esta action independente para simplicidade e rollback cirúrgico.

export async function createFreelanceDraft(): Promise<
  | { success: true; id: string }
  | { success: false; message: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) redirect('/login')

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) redirect('/dashboard')

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      workspace_id:      workspaceId,
      created_by:        user.id,
      // DB armazena 'Rascunho' (título neutro que passa o CHECK jobs_title_valid).
      // A UI exibe "Freelance sem título" quando isDraftFreelance(job) === true.
      title:             'Rascunho',
      client_name:       '',
      status:            'in_progress' as JobStatus,
      job_type:          'freelance'   as JobType,
      payment_condition: 'upfront'     as PaymentCondition,
      currency:          'BRL',
      total_value:       0,
      job_date:          new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[jobs/create-draft]', error)
    return { success: false, message: getErrorMessage('JOB_CREATE_FAILED') }
  }

  revalidatePath('/freelances')
  return { success: true, id: data.id }
}

// ─── UPDATE INFO — campos editáveis do job ────────────────────────────────────

export async function updateJob(
  id: string,
  fields: {
    title?:             string
    client_name?:       string
    /**
     * Atalho do ClientField: seta client_id + client_name em uma ação só,
     * sem passar pelo resolver getOrCreateClient (cliente já existe no banco).
     * Aceita null para desvincular explicitamente.
     * Se client_id e client_name vierem juntos, este prevalece.
     */
    client_ref?:        { id: string; name: string } | null
    client_email?:      string
    category?:          JobCategory | null
    job_type?:          JobType
    total_value?:       number
    currency?:          string
    payment_condition?: PaymentCondition
    job_date?:          string
    payment_due_date?:  string
    status?:            JobStatus
    notes?:             string
    budget_id?:         string | null
    // Analytics (migration 014)
    job_date_start?:    string | null
    job_date_end?:      string | null
    is_multi_day?:      boolean
    lead_source?:       string | null
    client_segment?:    string | null
    // ── Deploy 4 (F.6) — adapter UI unificado: {date_start, date_end} ──────
    // Quando informados, substituem a escrita direta dos 4 campos legados.
    // Produto trabalha em "intervalo"; banco mantém colunas separadas.
    date_start?:        string
    date_end?:          string | null
  }
): Promise<JobActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  // Garante que workspace_id nunca será alterado via updateJob
  const payload: Record<string, unknown> = {}

  if (fields.title !== undefined)
    payload.title = fields.title.trim() || 'Rascunho'

  // Cliente — dois caminhos:
  //   (a) client_ref (novo, preferido): { id, name } | null — ponteiro direto.
  //       Usado pelo ClientField: cliente JÁ existe, bastam os ponteiros.
  //
  //       BLINDAGEM DE CONSISTÊNCIA (server-side):
  //         · verifica que o client_id pertence ao workspace do usuário
  //           e não está soft-deleted — bloqueia id forjado/cross-workspace
  //         · descarta o `name` recebido do caller e re-lê `clients.name`
  //           direto do banco → client_id e client_name ficam sempre 100%
  //           coerentes entre si, mesmo se o caller enviar um nome stale
  //         · client_id + client_name são gravados no MESMO UPDATE (atômico)
  //
  //   (b) client_name (legado): resolve via getOrCreateClient. Mantido para
  //       compatibilidade com fluxos antigos (quickAdd, imports, etc.).
  //
  // Se ambos vierem, client_ref vence.
  if (fields.client_ref !== undefined) {
    if (fields.client_ref === null) {
      payload.client_id   = null
      payload.client_name = ''
    } else {
      const workspaceId = await getWorkspaceId(user.id)
      if (!workspaceId) {
        return { success: false, message: 'Workspace não encontrado.' }
      }

      const { data: client } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', fields.client_ref.id)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .maybeSingle()

      if (!client) {
        return {
          success: false,
          message: 'Cliente não encontrado neste workspace.',
        }
      }

      payload.client_id   = client.id
      payload.client_name = client.name // server é source of truth
    }
  } else if (fields.client_name !== undefined) {
    const cleaned = cleanName(fields.client_name)
    payload.client_name = cleaned

    if (cleaned) {
      const workspaceId = await getWorkspaceId(user.id)
      if (workspaceId) {
        const client = await getOrCreateClient(workspaceId, cleaned)
        payload.client_id = client?.id ?? null
      }
    } else {
      payload.client_id = null
    }
  }
  if (fields.client_email !== undefined)
    payload.client_email = fields.client_email.trim() || null
  if ('category' in fields)
    payload.category = fields.category ?? null
  if (fields.job_type !== undefined)
    payload.job_type = fields.job_type
  if (fields.total_value !== undefined)
    payload.total_value = Math.max(0, Math.round(fields.total_value * 100) / 100)
  if (fields.currency !== undefined)
    payload.currency = fields.currency
  if (fields.payment_condition !== undefined)
    payload.payment_condition = fields.payment_condition
  if (fields.job_date !== undefined)
    payload.job_date = fields.job_date || new Date().toISOString().split('T')[0]
  if (fields.payment_due_date !== undefined)
    payload.payment_due_date = fields.payment_due_date || null
  if (fields.status !== undefined)
    payload.status = fields.status
  if (fields.notes !== undefined)
    payload.notes = fields.notes.trim() || null
  if ('budget_id' in fields)
    payload.budget_id = fields.budget_id ?? null
  if ('job_date_start' in fields)
    payload.job_date_start = fields.job_date_start ?? null
  if ('job_date_end' in fields)
    payload.job_date_end = fields.job_date_end ?? null
  if (fields.is_multi_day !== undefined)
    payload.is_multi_day = fields.is_multi_day
  if ('lead_source' in fields)
    payload.lead_source = fields.lead_source?.trim() || null
  if ('client_segment' in fields)
    payload.client_segment = fields.client_segment?.trim() || null

  // ── Deploy 4 (F.6) — Adapter {date_start, date_end} → 4 colunas legadas ──
  //
  // Entrada (produto):            Mapeamento (banco):
  //   date_start (obrigatório)  →  job_date         = start
  //                                 job_date_start   = start
  //   date_end   (opcional)     →  job_date_end     = end ?? start
  //                                 is_multi_day     = end > start
  //
  // Defesa em profundidade (além do normalizador do componente):
  //   · end < start   → coagido a null (single-day)
  //   · end === start → coagido a null (single-day, is_multi_day=false)
  //
  // Aggregators/narrativa continuam lendo as 4 colunas legadas — zero impacto.
  if (fields.date_start !== undefined) {
    const start = fields.date_start
    const rawEnd = fields.date_end ?? null
    const safeEnd = rawEnd && rawEnd > start ? rawEnd : null
    payload.job_date       = start
    payload.job_date_start = start
    payload.job_date_end   = safeEnd ?? start
    payload.is_multi_day   = safeEnd !== null
  }

  if (Object.keys(payload).length === 0)
    return { success: false, message: 'Nenhum campo para atualizar.' }

  const { data, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[jobs/update]', error)
    return { success: false, message: 'Erro ao salvar job.' }
  }

  revalidatePath('/freelances')
  revalidatePath(`/freelances/${id}`)
  return { success: true, data }
}

// ─── UPDATE STATUS — atalho para trocar só o status ──────────────────────────

export async function updateJobStatus(
  id: string,
  status: JobStatus
): Promise<JobActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  // ── Backend safety · transição crítica para `paid` ───────────────────────
  //
  // Regra mínima de consistência de negócio: não aceitar marcar como pago um
  // job sem cliente vinculado (client_id null). Previne rascunho vazio virar
  // receita fantasma sem contraparte.
  //
  // Escopo estrito:
  //   · Só se aplica quando a transição é PARA `paid`
  //   · Edição normal, draft, delivered, in_progress: não exigem client_id
  //   · Qualquer outra validação fica com o fluxo existente (updateJob)
  if (status === 'paid') {
    const { data: current } = await supabase
      .from('jobs')
      .select('client_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!current) {
      return { success: false, message: 'Freelance não encontrado.' }
    }
    if (!current.client_id) {
      return {
        success: false,
        message: 'Vincule um cliente antes de marcar como pago.',
      }
    }
  }

  const { data, error } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[jobs/update-status]', error)
    return { success: false, message: 'Erro ao atualizar status.' }
  }

  revalidatePath('/freelances')
  revalidatePath(`/freelances/${id}`)
  return { success: true, data }
}

// ─── DELETE — soft delete ────────────────────────────────────────────────────

export async function deleteJob(id: string): Promise<JobActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[jobs/delete]', error)
    return { success: false, message: 'Erro ao excluir job.' }
  }

  revalidatePath('/freelances')
  return { success: true }
}

// ─── ADD PAYMENT — insere em job_payments, trigger recalcula amount_paid ──────

export async function addPayment(
  jobId: string,
  fields: {
    amount:      number
    received_at: string  // YYYY-MM-DD
    notes?:      string
    currency?:   string
  }
): Promise<JobPaymentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  if (!fields.amount || fields.amount <= 0)
    return { success: false, message: 'Valor deve ser maior que zero.' }

  if (!fields.received_at)
    return { success: false, message: 'Data de recebimento é obrigatória.' }

  // Busca moeda do job caso não seja informada
  let currency = fields.currency
  if (!currency) {
    const { data: job } = await supabase
      .from('jobs')
      .select('currency')
      .eq('id', jobId)
      .is('deleted_at', null)
      .maybeSingle()
    currency = job?.currency ?? 'BRL'
  }

  const { data: payment, error: paymentErr } = await supabase
    .from('job_payments')
    .insert({
      job_id:      jobId,
      amount:      Math.round(fields.amount * 100) / 100,
      currency,
      received_at: fields.received_at,
      notes:       fields.notes?.trim() || null,
    })
    .select()
    .single()

  if (paymentErr) {
    console.error('[jobs/add-payment]', paymentErr)
    return { success: false, message: 'Erro ao registrar pagamento.' }
  }

  // Busca job atualizado (amount_paid recalculado pelo trigger)
  const { data: updatedJob } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle()

  revalidatePath('/freelances')
  revalidatePath(`/freelances/${jobId}`)
  return { success: true, data: payment, job: updatedJob ?? undefined }
}

// ─── DELETE PAYMENT — remove pagamento, trigger recalcula amount_paid ─────────

export async function deletePayment(
  paymentId: string,
  jobId: string
): Promise<JobPaymentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('job_payments')
    .delete()
    .eq('id', paymentId)

  if (error) {
    console.error('[jobs/delete-payment]', error)
    return { success: false, message: 'Erro ao remover pagamento.' }
  }

  // Busca job atualizado (amount_paid recalculado pelo trigger)
  const { data: updatedJob } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle()

  revalidatePath('/freelances')
  revalidatePath(`/freelances/${jobId}`)
  return { success: true, job: updatedJob ?? undefined }
}

// ─── BULK DELETE — soft delete em lote (listagem) ────────────────────────────

export async function bulkDeleteJobs(
  ids: string[]
): Promise<{ success: boolean; message?: string }> {
  if (!ids.length) return { success: false, message: 'Nenhum job selecionado.' }

  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .is('deleted_at', null)

  if (error) {
    console.error('[jobs/bulk-delete]', error)
    return { success: false, message: 'Erro ao excluir jobs.' }
  }

  revalidatePath('/freelances')
  return { success: true }
}

// ─── BULK MARK AS PAID — pagamento em lote ───────────────────────────────────
//
// Regras de negócio (server-side, NÃO confia em valores da UI):
//
//   · Para cada id recebido:
//       1. Lê o estado atual do banco (status, totais, amount_paid, client_id)
//       2. Se status = 'paid' → skip ('already_paid')
//       3. Se client_id = null → skip ('no_client')
//          (mesma invariante do updateJobStatus('paid'): sem cliente não gera
//          receita paga — previne lixo financeiro)
//       4. Calcula total = (revenue_total || total_value) + cost_total
//          e remaining = max(0, total - amount_paid)
//       5. Se remaining > 0:
//            · INSERT em job_payments (amount = remaining, received_at = hoje,
//              notes = 'Pagamento em lote'). O trigger recalcula amount_paid.
//            · UPDATE jobs.status = 'paid'
//       6. Se remaining = 0 (já quitado mas status ainda não é paid):
//            · só atualiza status = 'paid'
//
// Processamento SEQUENCIAL por design — evita race conditions quando múltiplos
// cliques disparam simultaneamente (o segundo loop vê status = 'paid' do primeiro
// e faz skip). Também respeita o princípio de "um por vez" do usuário.
//
// Nunca aborta em erro parcial: itens com falha vão para `skipped[]` com
// motivo, itens OK vão para `processed[]`. O chamador decide o que mostrar.
//
// Invariantes garantidas ao final:
//   · nenhum job já pago foi alterado
//   · nenhum amount_paid ficou > total (usamos remaining = max(0, diff))
//   · status = 'paid' sempre vem junto com amount_paid >= total (ou amount_paid
//     já era >= total antes)

export type BulkPaySkipReason = 'already_paid' | 'no_client' | 'not_found' | 'error'

export interface BulkPayProcessed {
  id:     string
  title:  string
  amount: number    // quanto foi registrado neste pagamento em lote (0 se só flag)
}

export interface BulkPaySkipped {
  id:       string
  title?:   string
  reason:   BulkPaySkipReason
  message?: string
}

export interface BulkPayResult {
  success:   boolean
  message?:  string
  processed: BulkPayProcessed[]
  skipped:   BulkPaySkipped[]
}

export async function bulkMarkJobsAsPaid(ids: string[]): Promise<BulkPayResult> {
  if (!ids?.length) {
    return {
      success:   false,
      message:   'Nenhum freelance selecionado.',
      processed: [],
      skipped:   [],
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return { success: false, message: 'Não autorizado.', processed: [], skipped: [] }
  }

  const processed: BulkPayProcessed[] = []
  const skipped:   BulkPaySkipped[]   = []
  const today = new Date().toISOString().split('T')[0]

  // Sequencial por design — ver bloco de comentário acima.
  for (const id of ids) {
    // 1. Lê estado atual — RLS já filtra por workspace via policy em jobs.
    const { data: job, error: readErr } = await supabase
      .from('jobs')
      .select('id, title, status, client_id, revenue_total, cost_total, total_value, amount_paid, currency')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (readErr || !job) {
      skipped.push({ id, reason: 'not_found' })
      continue
    }

    // 2. Já pago → skip silencioso (UX: não soma, não processa)
    if (job.status === 'paid') {
      skipped.push({ id, title: job.title, reason: 'already_paid' })
      continue
    }

    // 3. Invariante de consistência: pago sem cliente não pode existir
    if (!job.client_id) {
      skipped.push({ id, title: job.title, reason: 'no_client' })
      continue
    }

    // 4. Cálculo server-side (nunca confia em valor enviado pela UI)
    const base      = Number(job.revenue_total) || Number(job.total_value)
    const total     = base + Number(job.cost_total)
    const paid      = Number(job.amount_paid)
    const remaining = Math.max(0, total - paid)
    const rounded   = Math.round(remaining * 100) / 100

    // 5. Registra pagamento se houver valor em aberto
    if (rounded > 0) {
      const { error: payErr } = await supabase
        .from('job_payments')
        .insert({
          job_id:      id,
          amount:      rounded,
          currency:    job.currency ?? 'BRL',
          received_at: today,
          notes:       'Pagamento em lote',
        })

      if (payErr) {
        console.error('[jobs/bulk-pay/payment-insert]', id, payErr)
        skipped.push({
          id, title: job.title, reason: 'error',
          message: 'Falha ao registrar pagamento.',
        })
        continue
      }
    }

    // 6. Atualiza status → 'paid'
    const { error: statusErr } = await supabase
      .from('jobs')
      .update({ status: 'paid' })
      .eq('id', id)
      .is('deleted_at', null)

    if (statusErr) {
      // Payment foi inserido mas status falhou. Do ponto de vista derivado
      // (getPaymentStatus) o job já é 'paid' porque amount_paid >= total.
      // Logamos mas contamos como processado para não confundir o usuário.
      console.error('[jobs/bulk-pay/status-update]', id, statusErr)
    }

    processed.push({ id, title: job.title, amount: rounded })
  }

  revalidatePath('/freelances')

  return {
    success: processed.length > 0,
    processed,
    skipped,
  }
}

// ─── GET WITH PAYMENTS — para a tela de detalhe ───────────────────────────────

export async function getJobWithPayments(id: string): Promise<JobWithPaymentsResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (jobErr || !job) return { success: false, message: 'Job não encontrado.' }

  const { data: payments } = await supabase
    .from('job_payments')
    .select('*')
    .eq('job_id', id)
    .order('received_at', { ascending: false })

  return {
    success: true,
    data: { ...job, payments: payments ?? [] },
  }
}
