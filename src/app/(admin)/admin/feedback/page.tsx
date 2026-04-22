import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FeedbackInbox from './feedback-inbox'
import type { Feedback } from '@/types/feedback'
import { isOpenAIEnabled } from '@/lib/feedback/openai-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Feedback — Admin Lumora' }

export default async function AdminFeedbackPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('feedback')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.warn('[admin/feedback] load error:', error.message)
  }

  const items = (data ?? []) as Feedback[]

  const counts = {
    total:      items.length,
    novo:       items.filter(i => i.status === 'novo').length,
    pendente:   items.filter(i => i.analysis_status === 'pending' || i.transcription_status === 'pending').length,
    critica:    items.filter(i => i.severity === 'critica').length,
    alta:       items.filter(i => i.severity === 'alta').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
            Feedback
          </p>
          <h1 className="text-2xl font-bold">Inbox de feedback</h1>
          <p className="text-sm text-[#737373] mt-1">
            {counts.total} mensagem{counts.total === 1 ? '' : 's'} · {counts.novo} novo{counts.novo === 1 ? '' : 's'}
            {counts.critica > 0 && <span className="ml-2 text-red-400">· {counts.critica} crítica{counts.critica === 1 ? '' : 's'}</span>}
            {counts.pendente > 0 && <span className="ml-2 text-amber-400">· {counts.pendente} processando</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/feedback/new"
            className="text-xs font-semibold px-3 py-2 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors"
          >
            + Adicionar manualmente
          </Link>
          <a
            href="/api/admin/feedback/export?format=csv"
            className="text-xs font-medium px-3 py-2 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors"
          >
            Excel (CSV)
          </a>
          <a
            href="/api/admin/feedback/export?format=md"
            className="text-xs font-medium px-3 py-2 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors"
          >
            Markdown p/ IA
          </a>
        </div>
      </div>

      {!isOpenAIEnabled() && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
          <strong>⚠️ OpenAI não configurada.</strong> Os feedbacks estão sendo salvos mas não analisados.
          Configure <code className="bg-black/40 px-1 rounded">OPENAI_API_KEY</code> nas env vars do Vercel
          (Production + Preview + Development) e redeploye para habilitar transcrição e análise automática.
        </div>
      )}

      <FeedbackInbox items={items} />
    </div>
  )
}
