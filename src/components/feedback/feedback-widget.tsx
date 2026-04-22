'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadFeedbackAudio } from '@/lib/storage/feedback-audio-upload'
import {
  uploadFeedbackAttachment,
  isAttachmentMimeAllowed,
  MAX_ATTACHMENT_BYTES,
  type UploadedAttachment,
} from '@/lib/storage/feedback-attachment-upload'
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

  // Attachment (print/imagem/PDF) — opcional, separado do texto e do áudio.
  // Cliente só guarda o File até o submit. O upload acontece no handleSubmit.
  const [attachFile, setAttachFile]       = useState<File | null>(null)
  const [attachPreview, setAttachPreview] = useState<string | null>(null)

  const mediaRef      = useRef<MediaRecorder | null>(null)
  const chunksRef     = useRef<BlobPart[]>([])
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const fileInputRef  = useRef<HTMLInputElement | null>(null)

  // Cleanup
  useEffect(() => {
    return () => {
      stopTimer()
      stopStream()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (attachPreview) URL.revokeObjectURL(attachPreview)
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
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachFile(null)
    setAttachPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [audioUrl, attachPreview])

  function handleAttachChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    if (f.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`Arquivo grande demais. Máx. 5 MB.`)
      e.target.value = ''
      return
    }
    if (!isAttachmentMimeAllowed(f.type)) {
      toast.error('Formato não suportado. Use imagem (PNG/JPG/WEBP/GIF/HEIC) ou PDF.')
      e.target.value = ''
      return
    }
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachFile(f)
    setAttachPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }

  function removeAttachment() {
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachFile(null)
    setAttachPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
      let attachmentUploaded: UploadedAttachment | null = null

      // Precisamos do user_id se houver áudio OU attachment
      const needsUser = (hasAudio && audioBlob) || !!attachFile
      let userId: string | null = null
      if (needsUser) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast.error('Sessão expirada. Recarregue a página.')
          setSending(false)
          return
        }
        userId = user.id
      }

      if (hasAudio && audioBlob && userId) {
        const up = await uploadFeedbackAudio(audioBlob, userId, audioMime)
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

      if (attachFile && userId) {
        const up = await uploadFeedbackAttachment(attachFile, userId)
        if ('error' in up) {
          console.error('[feedback] attach error:', up.error)
          toast.error(up.error)
          setSending(false)
          return
        }
        attachmentUploaded = up
      }

      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null

      const res = await submitFeedback({
        rawText:             hasText ? text.trim() : null,
        audioPath,
        audioMime:           audioMimeFinal,
        audioDurationSec:    audioDur,
        attachmentPath:      attachmentUploaded?.path ?? null,
        attachmentFilename:  attachmentUploaded?.filename ?? null,
        attachmentMime:      attachmentUploaded?.mime ?? null,
        attachmentSize:      attachmentUploaded?.size ?? null,
        userType:            type,
        sourcePage:          pathname,
        userAgent:           ua,
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

              {/* Anexo opcional — print/imagem/PDF. Mesmo lugar nas duas tabs. */}
              <div className="pt-2 border-t border-[#1a1a1a]">
                <label className="text-[10px] uppercase tracking-wider text-[#a3a3a3] block mb-1.5">
                  Anexo (opcional)
                </label>
                <p className="text-[11px] leading-relaxed text-[#737373] mb-2">
                  Pra ajudar a gente a entender, se o erro ainda estiver aí, volta
                  na tela, tira um print e anexa aqui. <span className="text-[#D4A853]/80">
                  Dica: se você fechar essa janela, talvez precise recomeçar o
                  feedback.</span>
                </p>

                {!attachFile ? (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,application/pdf"
                      onChange={handleAttachChoose}
                      disabled={sending}
                      className="hidden"
                      id="feedback-attach-input"
                    />
                    <label
                      htmlFor="feedback-attach-input"
                      className={`
                        flex items-center justify-center gap-2
                        text-xs py-2 px-3 rounded-md border border-dashed
                        border-[#2a2a2a] text-[#a3a3a3]
                        hover:border-[#D4A853]/60 hover:text-white
                        cursor-pointer transition-colors
                        ${sending ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      Escolher print ou imagem · máx. 5 MB
                    </label>
                  </div>
                ) : (
                  <div className="border border-[#2a2a2a] rounded-md p-2 bg-[#0a0a0a] flex items-center gap-3">
                    {attachPreview ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={attachPreview}
                        alt="Preview"
                        className="w-14 h-14 object-cover rounded-sm border border-[#1f1f1f] shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-sm border border-[#1f1f1f] bg-[#141414] flex items-center justify-center text-[#737373] shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{attachFile.name}</p>
                      <p className="text-[10px] text-[#737373]">
                        {(attachFile.size / 1024).toFixed(0)} KB · {attachFile.type || 'tipo desconhecido'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={removeAttachment}
                      disabled={sending}
                      className="text-[11px] text-[#737373] hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                      aria-label="Remover anexo"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
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
