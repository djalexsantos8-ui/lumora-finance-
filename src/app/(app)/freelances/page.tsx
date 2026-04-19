import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewJobButton } from './new-job-button'
import { JobsListClient } from './jobs-list-client'
import type { Job } from '@/types/job'

export const metadata = { title: 'Freelances — Lumora Finance' }

// ─── Filtro de mês atual ──────────────────────────────────────────────────────

function currentMonthRange(): { from: string; to: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const from = new Date(year, month, 1).toISOString().split('T')[0]
  const to   = new Date(year, month + 1, 0).toISOString().split('T')[0]
  return { from, to }
}

function monthLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function JobsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  const { from, to } = currentMonthRange()

  // ─── Overlap query ───────────────────────────────────────────────────────────
  // Single-day:  job_date BETWEEN from AND to
  // Multi-day:   job_date_start <= to
  //              AND (job_date_end IS NULL OR job_date_end >= from)
  //
  // NULL no job_date_end é tratado como "sem fim" — aparece no mês corrente
  // enquanto o job_date_start estiver dentro do to bound.
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .or(
      `and(is_multi_day.eq.false,job_date.gte.${from},job_date.lte.${to}),` +
      `and(is_multi_day.eq.true,job_date_start.lte.${to},or(job_date_end.is.null,job_date_end.gte.${from}))`
    )
    .order('job_date', { ascending: false })

  const list = (jobs ?? []) as Job[]

  return (
    <div className="min-h-full p-6 md:p-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold text-white">Freelances</h1>
        <NewJobButton />
      </div>

      {/* ── Lista (client component — gerencia seleção múltipla e delete) ───── */}
      <JobsListClient jobs={list} monthLabel={monthLabel()} />

    </div>
  )
}
