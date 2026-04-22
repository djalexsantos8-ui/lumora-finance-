'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createManualFeedback } from '@/lib/actions/feedback'
import type { FeedbackUserType } from '@/types/feedback'

const TYPES: FeedbackUserType[] = ['bug', 'ux', 'melhoria', 'duvida', 'elogio', 'outro']

export default function ManualForm() {
  const router = useRouter()
  const [text, setText]   = useState('')
  const [type, setType]   = useState<FeedbackUserType>('melhoria')
  const [email, setEmail] = useState('')
  const [page, setPage]   = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!text.trim()) { toast.error('Texto obrigatório'); return }
    startTransition(async () => {
      const res = await createManualFeedback({
        rawText:    text.trim(),
        userType:   type,
        email:      email.trim() || null,
        sourcePage: page.trim() || null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Feedback criado. IA vai analisar em alguns segundos.')
      router.push(`/admin/feedback/${res.id}`)
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-5">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-1">
          Texto do feedback
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Cole a mensagem, transcreva a call, anote o que o beta falou…"
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#525252] resize-y focus:border-[#D4A853] focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-1">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FeedbackUserType)}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white"
          >
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-1">
            Email (opcional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="fulano@exemplo.com"
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white placeholder:text-[#525252] focus:border-[#D4A853] focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-1">
          Página/área (opcional)
        </label>
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="/dashboard, conversa Whatsapp, call…"
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white placeholder:text-[#525252] focus:border-[#D4A853] focus:outline-none"
        />
      </div>

      <div className="pt-3 border-t border-[#1a1a1a] flex justify-end gap-2">
        <button
          onClick={() => router.back()}
          disabled={pending}
          className="text-xs px-4 py-2 text-[#a3a3a3] hover:text-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={pending || !text.trim()}
          className="text-xs font-semibold px-5 py-2 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Salvando…' : 'Criar feedback'}
        </button>
      </div>
    </div>
  )
}
