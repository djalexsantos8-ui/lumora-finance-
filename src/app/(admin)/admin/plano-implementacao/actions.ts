'use server'

import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { revalidatePath } from 'next/cache'
import { notifyAdminOfFailure } from '@/lib/notifications/admin-email'

const PATH = '/admin/plano-implementacao'

type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

async function requireAdmin() {
  const check = await checkAdmin()
  if (!check.isAdmin) throw new Error('not_authorized')
  return check
}

/** Inicia uma task: status=doing + started_at=now */
export async function startTask(taskId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('implementation_tasks')
      .update({
        status: 'doing',
        started_at: new Date().toISOString(),
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Conclui uma task com resultado em linguagem simples */
export async function completeTask(taskId: string, resultNotes: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('implementation_tasks')
      .update({
        status: 'done',
        result: 'success',
        result_notes: resultNotes || 'Concluído.',
        finished_at: new Date().toISOString(),
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Marca task como bloqueada */
export async function blockTask(taskId: string, blocker: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = await createClient()
    const { data: task } = await supabase
      .from('implementation_tasks')
      .select('epic_code, title')
      .eq('id', taskId)
      .single()

    const { error } = await supabase
      .from('implementation_tasks')
      .update({
        status: 'blocked',
        blocker: blocker || 'Bloqueado sem detalhes.',
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (error) return { ok: false, error: error.message }

    // Notifica admin por email (best-effort)
    if (task && admin.email) {
      void notifyAdminOfFailure({
        taskId,
        epicCode: task.epic_code,
        taskTitle: task.title,
        errorMessage: blocker,
        toEmail: admin.email,
        whatWasTried: 'Marcar a task como bloqueada manualmente',
      })
    }

    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Cancela uma task */
export async function cancelTask(taskId: string, reason: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('implementation_tasks')
      .update({
        status: 'cancelled',
        result: 'partial',
        result_notes: `Cancelada: ${reason || 'sem motivo registrado'}`,
        finished_at: new Date().toISOString(),
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Reabre uma task concluída/cancelada */
export async function reopenTask(taskId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('implementation_tasks')
      .update({
        status: 'pending',
        result: null,
        finished_at: null,
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Adiciona task na fila do Claude (queue=true + insere claude_inbox) */
export async function queueForClaude(taskId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = await createClient()

    // Marca a task
    const { error: updErr } = await supabase
      .from('implementation_tasks')
      .update({
        queued_for_claude: true,
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (updErr) return { ok: false, error: updErr.message }

    // Insere na inbox
    const { error: inboxErr } = await supabase
      .from('claude_inbox')
      .insert({
        task_id: taskId,
        requested_by: admin.userId,
        status: 'queued',
      })
    if (inboxErr) return { ok: false, error: inboxErr.message }

    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Remove task da fila do Claude */
export async function unqueueFromClaude(taskId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    await supabase
      .from('implementation_tasks')
      .update({
        queued_for_claude: false,
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    await supabase
      .from('claude_inbox')
      .update({ status: 'skipped' })
      .eq('task_id', taskId)
      .eq('status', 'queued')
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Cria task nova ad-hoc (pedido do Leleco) */
export async function createTask(input: {
  title: string
  descriptionSimple: string
  area?: string
  priority?: 'P0' | 'P1' | 'P2' | 'P3'
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireAdmin()
    const supabase = await createClient()

    // Próximo número de epic
    const { data: maxRow } = await supabase
      .from('implementation_tasks')
      .select('epic_code')
      .like('epic_code', 'EPIC-%')
      .order('epic_code', { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextNum = 100
    if (maxRow?.epic_code) {
      const m = maxRow.epic_code.match(/EPIC-(\d+)/)
      if (m) nextNum = Math.max(parseInt(m[1], 10) + 1, 100)
    }
    const epicCode = `EPIC-${String(nextNum).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('implementation_tasks')
      .insert({
        epic_code: epicCode,
        title: input.title,
        description_simple: input.descriptionSimple,
        area: input.area ?? 'produto',
        priority: input.priority ?? 'P2',
        status: 'pending',
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' }

    revalidatePath(PATH)
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Salva observações livres em uma task */
export async function updateNotes(taskId: string, notes: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('implementation_tasks')
      .update({
        notes,
        last_action_by: 'leleco',
        last_action_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
