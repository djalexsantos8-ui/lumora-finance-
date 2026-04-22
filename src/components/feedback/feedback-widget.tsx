'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadFeedbackAudio } from '@/lib/storage/feedback-audio-upload'
import { submitFeedback } from '@/lib/actions/feedback'
import type { FeedbackUserType } from '@/types/feedback'

type Tab = 'texto' | 'audio'
type RecState = 'idle' | 'recording' | 'stopped'

const TYPE_OPTIONS: Array<{ value: FeedbackUserType; label: string; emoji: string }> = [
  { value: 'bug',      label: 'Bug',        emoji: '🐛' },
  { value: 'ux',       label: 'UX ruim',    emoji: '😕' },
  { value: 'melhoria', label: 'Ideia',      emoji: '💡' },
  { value: 'duvida',   label: 'Dúvida',     emoji: '❓' },
  { value: 'elogio',   label: 'Elogio',     emoji: '💛' },
  { value: 'outro',    label: 'Outro',      emoji: '📝' },
]

export default function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen]         = useState(false)
  const [tab, setTab]           = useState<Tab>('texto')
  const [text, setText]         = useState('')
  const [type, setType]         = useState<FeedbackUserType>('melhoria')
  const [sending, setSending]   = useState(false)
  const [recState, setRecState] = useState<RecState>('idle')
  const [recTime, setRecTime]   = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioMime, setAudioMime] = useState<string>('audio/webm')
  const [audioUrl, setAudioUrl]   = useState<string | null>(null)

  const mediaRef      = useRef<MediaRecorder | null>(null)
  const chunksRef     = useRef<BlobPart[]>([])
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)

  // Cleanup
  useEffect(() => {
    return () => {
      stopTimer()
      stopStream()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const reset = useCallback(() => {
    setText('')
    setType('melhoria')
    setTab('texto')
    setAudioBlob(null)
    setAudioMime('audio/webm')
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setRecState('idle')
    setRecTime(0)
    stopTimer()
    stopStream()
  }, [audioUrl])

  async function startRecording() {
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices) {
        toast.error('Seu navegador não suporta gravação de áudio.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Prefer webm/opus, fallback automático
      const mimeOptions = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
      ]
      let chosenMime = ''
      for (const m of mimeOptions) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          chosenMime = m
          break
        }
      }
      const rec = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream)
      mediaRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        setAudioBlob(blob)
        setAudioMime(rec.mimeType || 'audio/webm')
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setRecState('stopped')
        stopTimer()
        stopStream()
      }
      rec.start()
      setRecState('recording')
      setRecTime(0)
      timerRef.current = setInterval(() => {
        setRecTime((t) => {
          if (t >= 299) {   // 5 min max
            stopRecording()
            return 300
          }
          return t + 1
        })
      }, 1000)
    } catch (err) {
      console.error('[feedback] mic error:', err)
      toast.error('Não foi possível acessar o microfone.')
    }
  }

  function stopRecording() {
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      mediaRef.current.stop()
    }
  }

  function discardAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setAudioMime('audio/webm')
    setRecState('idle')
    setRecTime(0)
  }

  async function handleSubmit() {
    if (sending) return

    const hasText = text.trim().length > 0
    const hasAudio = !!audioBlob
    if (!hasText && !hasAudio) {
      toast.error('Escreva algo ou grave um áudio antes de enviar.')
      return
    }

    setSending(true)
    try {
      let audioPath: string | null = null
      let audioMimeFinal: string | null = null
      let audioDur: number | null = null

      if (hasAudio && audioBlob) {
        // Precisa do user_id pra montar o path
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast.error('Sessão expirada. Recarregue a página.')
          setSending(false)
          return
        }

        const up = await uploadFeedbackAudio(audioBlob, user.id, audioMime)
        if ('error' in up) {
          console.error('[feedback] upload error:', up.error)
          toast.error('Falha ao enviar áudio. Tenta de novo?')
          setSending(false)
          return
        }
        audioPath = up.path
        audioMimeFinal = audioMime
        audioDur = recTime > 0 ? recTime : null
      }

      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null

      const res = await submitFeedback({
        rawText:          hasText ? text.trim() : null,
        audioPath,
        audioMime:        audioMimeFinal,
        audioDurationSec: audioDur,
        userType:         type,
        sourcePage:       pathname,
        userAgent:        ua,
      })

      if (!res.ok) {
        toast.error(res.error || 'Erro ao enviar feedback.')
        setSending(false)
        return
      }

      toast.success('Obrigado! Seu feedback foi enviado.')
      reset()
      setOpen(false)
    } catch (err) {
      console.error('[feedback] submit fatal:', err)
      toast.error('Erro inesperado. Tenta de novo.')
    } finally {
      setSending(false)
    }
  }

  // Não exibe na área admin — admin tem inbox dedicada
  if (pathname?.startsWith('/admin')) return null

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="
            fixed bottom-5 right-5 z-40
            flex items-center gap-2
            bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a]
            font-semibold text-xs px-4 py-2.5 rounded-full
            shadow-lg shadow-black/40
            transition-colors
          "
          aria-label="Enviar feedback"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A8.96 8.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Feedback
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6"
          onClick={(e) => { if (e.target === e.currentTarget && !sending) setOpen(false) }}
        >
          <div className="w-full max-w-lg bg-[#0d0d0d] border border-[#1f1f1f] rounded-t-2xl md:rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
              <div>
                <h3 className="text-sm font-bold text-white">Enviar feedback</h3>
                <p className="text-[11px] text-[#737373] mt-0.5">
                  Diga o que achou, o que quebrou, ou o que pode melhorar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!sending) { setOpen(false); reset() } }}
                className="text-[#737373] hover:text-white text-xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-2">
                  Tipo
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`
                        text-xs py-2 rounded-md border transition-colors
                        ${type === opt.value
                          ? 'border-[#D4A853] bg-[#D4A853]/10 text-[#D4A853]'
                          : 'border-[#2a2a2a] text-[#a3a3a3] hover:border-[#3a3a3a] hover:text-white'}
                      `}
                    >
                      <span className="mr-1">{opt.emoji}</span>{opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[#1a1a1a]">
                <button
                  type="button"
                  onClick={() => setTab('texto')}
                  className={`
                    flex-1 text-xs py-2 border-b-2 transition-colors
                    ${tab === 'texto'
                      ? 'text-[#D4A853] border-[#D4A853]'
                      : 'text-[#737373] border-transparent hover:text-white'}
                  `}
                >
                  Texto
                </button>
                <button
                  type="button"
                  onClick={() => setTab('audio')}
                  className={`
                    flex-1 text-xs py-2 border-b-2 transition-colors
                    ${tab === 'audio'
                      ? 'text-[#D4A853] border-[#D4A853]'
                      : 'text-[#737373] border-transparent hover:text-white'}
                  `}
                >
                  Áudio
                </button>
              </div>

              {/* Tab content */}
              {tab === 'texto' ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  maxLength={8000}
                  placeholder="Conta pra gente. Seja direto."
                  className="
                    w-full bg-[#0a0a0a] border border-[#2a2a2a]
                    rounded-md px-3 py-2 text-sm text-white
                    placeholder:text-[#525252]
                    focus:border-[#D4A853] focus:outline-none
                    resize-none
                  "
                />
              ) : (
                <div className="border border-[#2a2a2a] rounded-md p-4 flex flex-col items-center gap-3 bg-[#0a0a0a]">
                  {recState === 'idle' && (
                    <>
                      <p className="text-xs text-[#a3a3a3] text-center">
                        Clique para começar a gravar.<br />
                        Máx. 5 minutos.
                      </p>
                      <button
                        type="button"
                        onClick={startRecording}
                        className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center"
                        aria-label="Gravar áudio"
                      >
                        <div className="w-5 h-5 rounded-full bg-white" />
                      </button>
                    </>
                  )}

                  {recState === 'recording' && (
                    <>
                      <div className="flex items-center gap-2 text-red-400 text-xs">
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        gravando · {formatTime(recTime)}
                      </div>
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="w-14 h-14 rounded-md bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center"
                        aria-label="Parar gravação"
                      >
                        <div className="w-5 h-5 bg-white" />
                      </button>
                    </>
                  )}

                  {recState === 'stopped' && audioUrl && (
                    <>
                      <div className="text-xs text-[#a3a3a3]">
                        Gravação de {formatTime(recTime)}
                      </div>
                      <audio controls src={audioUrl} className="w-full" />
                      <button
                        type="button"
                        onClick={discardAudio}
                        className="text-[11px] text-[#737373] hover:text-red-400 underline underline-offset-2"
                      >
                        Descartar e gravar de novo
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Combinação: texto + áudio também é válido */}
              {tab === 'audio' && recState === 'stopped' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-2">
                    Quer escrever algo junto? (opcional)
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={2}
                    maxLength={8000}
                    placeholder="Contexto extra, link, screenshot..."
                    className="
                      w-full bg-[#0a0a0a] border border-[#2a2a2a]
                      rounded-md px-3 py-2 text-sm text-white
                      placeholder:text-[#525252]
                      focus:border-[#D4A853] focus:outline-none
                      resize-none
                    "
                  />
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-[#1a1a1a] flex items-center justify-between gap-3">
              <p className="text-[10px] text-[#525252]">
                Sua mensagem chega direto pro time do Lumora.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { if (!sending) { setOpen(false); reset() } }}
                  disabled={sending}
                  className="text-xs px-4 py-2 text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={sending || (!text.trim() && !audioBlob)}
                  className="
                    text-xs font-semibold px-5 py-2 rounded-md
                    bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a]
                    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
