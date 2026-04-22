'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  updateFeedbackStatus,
  deleteFeedback,
  reprocessFeedback,
  getFeedbackAudioSignedUrl,
  getFeedbackAttachmentSignedUrl,
} from '@/lib/actions/feedback'
import type { Feedback, FeedbackStatus } from '@/types/feedback'

/**
 * Client components for feedback detail page.
 *
 * IMPORTANT (Next 16 RSC):
 *   Cada subcomponente precisa ser um NAMED export individual.
 *   Exportar um objeto `{ Panel, AudioPlayer, ... }` como default vira um
 *   "client reference proxy" opaco quando importado por um server component,
 *   e acessar `.Panel` retorna undefined → React renderiza `<undefined>` e a
 *   página inteira cai no global-error boundary ("Erro inesperado").
 *   Por isso NÃO agrupamos mais em um default export.
 */

const STATUSES: FeedbackStatus[] = [
  'novo', 'triagem', 'planejado', 'em_andamento', 'resolvido', 'descartado',
]

export function Panel({ feedback }: { feedback: Feedback }) {
  const router = useRouter()
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status)
  const [notes, setNotes]   = useState(feedback.admin_notes ?? '')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await updateFeedbackStatus(feedback.id, status, notes)
        if (!res.ok) { toast.error(res.error); return }
        toast.success('Salvo')
        router.refresh()
      } catch (e) {
        toast.error('Falha ao salvar — verifique a conexão')
        console.error('[feedback.panel.save]', e)
      }
    })
  }

  function handleReprocess() {
    startTransition(async () => {
      try {
        const res = await reprocessFeedback(feedback.id)
        if (!res.ok) { toast.error(res.error); return }
        toast.success('Reprocessado')
        router.refresh()
      } catch (e) {
        toast.error('Falha ao reprocessar — tente novamente')
        console.error('[feedback.panel.reprocess]', e)
      }
    })
  }

  function handleDelete() {
    if (!confirm('Arquivar este feedback? (soft delete, pode ser recuperado via DB)')) return
    startTransition(async () => {
      try {
        const res = await deleteFeedback(feedback.id)
        if (!res.ok) { toast.error(res.error); return }
        toast.success('Arquivado')
        router.push('/admin/feedback')
      } catch (e) {
        toast.error('Falha ao arquivar')
        console.error('[feedback.panel.delete]', e)
      }
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

export function AudioPlayer({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await getFeedbackAudioSignedUrl(id)
      if (!res.ok) { toast.error(res.error); return }
      setUrl(res.data?.url ?? null)
    } catch (e) {
      toast.error('Falha ao carregar áudio')
      console.error('[feedback.audio-player]', e)
    } finally {
      setLoading(false)
    }
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

export function AttachmentViewer({
  id,
  filename,
  mime,
  sizeBytes,
}: {
  id:        string
  filename:  string | null
  mime:      string | null
  sizeBytes: number | null
}) {
  const [url, setUrl]         = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isImage = (mime ?? '').startsWith('image/')
  const isPdf   = mime === 'application/pdf'

  async function load() {
    setLoading(true)
    try {
      const res = await getFeedbackAttachmentSignedUrl(id)
      if (!res.ok) { toast.error(res.error); return }
      setUrl(res.data?.url ?? null)
    } catch (e) {
      toast.error('Falha ao carregar anexo')
      console.error('[feedback.attachment-viewer]', e)
    } finally {
      setLoading(false)
    }
  }

  const sizeKb = sizeBytes ? (sizeBytes / 1024).toFixed(0) : null

  if (!url) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-[#a3a3a3]">
          📎 {filename ?? 'anexo'}
          {mime && <span className="text-[#525252] ml-2">({mime})</span>}
          {sizeKb && <span className="text-[#525252] ml-2">· {sizeKb} KB</span>}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] disabled:opacity-50"
        >
          {loading ? 'Carregando…' : '📥 Carregar anexo'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[#a3a3a3]">
        📎 {filename ?? 'anexo'}
        {mime && <span className="text-[#525252] ml-2">({mime})</span>}
        {sizeKb && <span className="text-[#525252] ml-2">· {sizeKb} KB</span>}
      </div>
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={filename ?? 'Anexo'}
          className="max-w-full rounded-md border border-[#1a1a1a]"
          style={{ maxHeight: 600 }}
        />
      )}
      {isPdf && (
        <iframe
          src={url}
          className="w-full rounded-md border border-[#1a1a1a] bg-white"
          style={{ height: 600 }}
          title={filename ?? 'Anexo PDF'}
        />
      )}
      {!isImage && !isPdf && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#D4A853] underline"
        >
          Abrir anexo em nova aba
        </a>
      )}
      <div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[#737373] hover:text-white underline"
        >
          Abrir em nova aba ↗
        </a>
      </div>
    </div>
  )
}

export function PromptCopyBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast.success('Prompt copiado — cola em uma nova sessão Cloud Code')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Não consegui copiar — copie manualmente')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold">
          🤖 Prompt Cloud Code · pronto pra colar
        </div>
        <button
          onClick={handleCopy}
          className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#D4A853]/40 text-[#D4A853] hover:bg-[#D4A853]/10 transition-colors"
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="text-[11px] text-[#e5e5e5] whitespace-pre-wrap bg-[#0a0a0a] border border-[#1a1a1a] rounded-md p-3 max-h-[400px] overflow-auto leading-relaxed">
        {prompt}
      </pre>
    </div>
  )
}
