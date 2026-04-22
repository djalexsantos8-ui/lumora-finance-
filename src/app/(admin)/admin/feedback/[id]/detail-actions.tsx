'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  updateFeedbackStatus,
  deleteFeedback,
  reprocessFeedback,
  getFeedbackAudioSignedUrl,
} from '@/lib/actions/feedback'
import type { Feedback, FeedbackStatus } from '@/types/feedback'

const STATUSES: FeedbackStatus[] = [
  'novo', 'triagem', 'planejado', 'em_andamento', 'resolvido', 'descartado',
]

function Panel({ feedback }: { feedback: Feedback }) {
  const router = useRouter()
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status)
  const [notes, setNotes]   = useState(feedback.admin_notes ?? '')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await updateFeedbackStatus(feedback.id, status, notes)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Salvo')
      router.refresh()
    })
  }

  function handleReprocess() {
    startTransition(async () => {
      const res = await reprocessFeedback(feedback.id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Reprocessado')
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirm('Arquivar este feedback? (soft delete, pode ser recuperado via DB)')) return
    startTransition(async () => {
      const res = await deleteFeedback(feedback.id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Arquivado')
      router.push('/admin/feedback')
    })
  }

  return (
    <section className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 space-y-3">
      <h3 className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold">Gerenciar</h3>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#737373] block mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#737373] block mb-1">Notas do time</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notas internas sobre este feedback…"
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white placeholder:text-[#525252] resize-none focus:border-[#D4A853] focus:outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={pending}
          className="flex-1 text-xs font-semibold px-3 py-2 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <div className="flex gap-2 pt-2 border-t border-[#1a1a1a]">
        <button
          onClick={handleReprocess}
          disabled={pending}
          className="flex-1 text-xs px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] disabled:opacity-50 transition-colors"
        >
          Reanalisar IA
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="flex-1 text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          Arquivar
        </button>
      </div>
    </section>
  )
}

function AudioPlayer({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await getFeedbackAudioSignedUrl(id)
    setLoading(false)
    if (!res.ok) { toast.error(res.error); return }
    setUrl(res.data?.url ?? null)
  }

  if (url) return <audio controls src={url} className="w-full mt-1" />

  return (
    <button
      onClick={load}
      disabled={loading}
      className="text-xs px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] disabled:opacity-50"
    >
      {loading ? 'Carregando…' : '▶ Carregar áudio'}
    </button>
  )
}

const FeedbackDetailActions = { Panel, AudioPlayer }
export default FeedbackDetailActions
