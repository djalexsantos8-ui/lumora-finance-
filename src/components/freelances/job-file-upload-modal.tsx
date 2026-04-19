'use client'

/**
 * JobFileUploadModal — modal de upload com drag-drop + click.
 *
 * UX v2 (após feedback do usuário):
 *   · Após cada upload bem-sucedido, mostra o arquivo DENTRO do modal
 *     (nome, tipo, tamanho, check verde) — não só no toast.
 *   · Enquanto enviando: contador + spinner.
 *   · Dropzone continua disponível (usuário pode arrastar mais sem clicar nada).
 *   · Footer: se já enviou ao menos 1 arquivo → "Adicionar mais" + "Concluir".
 *     Se ainda não enviou nada → "Fechar".
 *   · "Concluir" dispara onClose() e reseta a lista da sessão.
 *   · "Adicionar mais" mantém a lista visível e reabre o picker.
 *
 * Estado da sessão (uploadedFiles) zera ao abrir — cada abertura = sessão nova.
 *
 * A11y: role="dialog", aria-modal, Esc fecha (se não está uploadando),
 * backdrop click fecha (idem), botão fechar disabled durante upload.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { uploadJobFile } from '@/lib/storage/job-file-upload'
import type { JobFile } from '@/types/job-file'

interface Props {
  open:         boolean
  onClose:      () => void
  workspaceId:  string
  jobId:        string
  /** Chamado a cada upload concluído (pai atualiza lista de comprovantes). */
  onUploaded:   (file: JobFile) => void
}

export function JobFileUploadModal({ open, onClose, workspaceId, jobId, onUploaded }: Props) {
  const [dragActive,     setDragActive]     = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadedFiles,  setUploadedFiles]  = useState<JobFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Close wrapper: reseta a sessão antes de delegar pro pai. Todas as saídas
  // (Esc, backdrop, botão fechar, "Concluir") passam por aqui — assim o modal
  // sempre abre limpo na próxima vez sem depender de efeito com setState.
  function closeAndReset() {
    setUploadedFiles([])
    setUploadingCount(0)
    setDragActive(false)
    onClose()
  }

  // Esc fecha (se não tem upload em andamento — não perder arquivo a meio caminho)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && uploadingCount === 0) closeAndReset()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploadingCount])

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    setUploadingCount(c => c + files.length)
    // Paralelo: cada arquivo independente
    await Promise.all(files.map(async (file) => {
      const res = await uploadJobFile({ workspaceId, jobId, file })
      if (res.success) {
        setUploadedFiles(prev => [res.data, ...prev])
        onUploaded(res.data)
      } else {
        toast.error(`${file.name}: ${res.message}`)
      }
      setUploadingCount(c => c - 1)
    }))
  }

  function onPickClick() {
    if (uploadingCount > 0) return
    inputRef.current?.click()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (uploadingCount > 0) return
    handleFiles(Array.from(e.dataTransfer.files ?? []))
  }

  function handleConclude() {
    if (uploadingCount > 0) return
    closeAndReset()
  }

  function handleAddMore() {
    if (uploadingCount > 0) return
    inputRef.current?.click()
  }

  // SSR-safe gate: durante render no server document não existe — não
  // tenta criar portal. No client o componente remonta e o portal sobe.
  if (!open || typeof document === 'undefined') return null

  const hasUploaded = uploadedFiles.length > 0
  const isUploading = uploadingCount > 0

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) closeAndReset()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-file-upload-title"
        className="w-full max-w-md bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="job-file-upload-title" className="text-sm font-semibold text-white">
            {hasUploaded ? 'Comprovantes enviados' : 'Enviar comprovante'}
          </h3>
          <button
            type="button"
            onClick={closeAndReset}
            disabled={isUploading}
            aria-label="Fechar"
            className="text-[#737373] hover:text-white disabled:opacity-40 transition-colors p-1 rounded hover:bg-[#1f1f1f]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drop zone — sempre disponível (exceto durante upload) */}
        <div
          role="button"
          tabIndex={0}
          onClick={onPickClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickClick() } }}
          onDragEnter={e => { e.preventDefault(); setDragActive(true) }}
          onDragOver={e  => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
          onDrop={onDrop}
          className={`rounded-lg text-center transition-colors border-2 border-dashed outline-none ${
            hasUploaded ? 'py-6 px-5' : 'py-10 px-5'
          } ${
            dragActive
              ? 'border-[#D4A853] bg-[#D4A853]/5'
              : 'border-[#2a2a2a] hover:border-[#3a3a3a] focus-visible:border-[#D4A853]/50'
          } ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-disabled={isUploading}
        >
          {isUploading ? (
            <>
              {/* Spinner */}
              <svg className="w-6 h-6 mx-auto text-[#D4A853] mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-xs text-[#D4A853]">
                Enviando {uploadingCount} arquivo{uploadingCount > 1 ? 's' : ''}...
              </p>
            </>
          ) : hasUploaded ? (
            <>
              <svg className="w-6 h-6 mx-auto text-[#525252] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-xs text-[#a3a3a3]">Arraste ou clique para adicionar mais</p>
            </>
          ) : (
            <>
              <svg className="w-10 h-10 mx-auto text-[#525252] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-xs text-white font-semibold mb-1">
                Arraste um arquivo aqui ou clique para selecionar
              </p>
              <p className="text-[10px] text-[#737373]">
                PDF, JPG, PNG ou HEIC · até 10MB final
              </p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            handleFiles(files)
          }}
          className="hidden"
        />

        {/* Lista de arquivos enviados nesta sessão */}
        {hasUploaded && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-emerald-400 font-semibold">
                {uploadedFiles.length} arquivo{uploadedFiles.length > 1 ? 's' : ''} enviado{uploadedFiles.length > 1 ? 's' : ''} com sucesso
              </p>
            </div>
            <ul className="space-y-1.5">
              {uploadedFiles.map(f => (
                <li
                  key={f.id}
                  className="flex items-center gap-2.5 bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg px-3 py-2"
                >
                  <FileIcon mime={f.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white truncate" title={f.file_name}>
                      {f.file_name}
                    </p>
                    <p className="text-[10px] text-[#525252] mt-0.5">
                      {prettyType(f.mime_type)} · {prettyBytes(f.size_bytes)}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        {hasUploaded ? (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={handleAddMore}
              disabled={isUploading}
              className="text-xs text-[#a3a3a3] hover:text-white py-2 rounded-lg border border-[#2a2a2a] hover:bg-[#1f1f1f] disabled:opacity-40 transition-colors"
            >
              Adicionar mais
            </button>
            <button
              type="button"
              onClick={handleConclude}
              disabled={isUploading}
              className="text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] py-2 rounded-lg disabled:opacity-40 transition-colors"
            >
              Concluir
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={closeAndReset}
            disabled={isUploading}
            className="w-full mt-4 text-xs text-[#a3a3a3] hover:text-white py-2 rounded-lg border border-[#2a2a2a] hover:bg-[#1f1f1f] disabled:opacity-40 transition-colors"
          >
            {isUploading ? 'Aguarde os uploads terminarem...' : 'Fechar'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Helpers visuais (mesmo estilo usado na lista de comprovantes) ───────────

function FileIcon({ mime }: { mime: string }) {
  const isPdf = mime === 'application/pdf'
  return (
    <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold ${
      isPdf ? 'bg-red-500/10 text-red-400' : 'bg-sky-500/10 text-sky-400'
    }`}>
      {isPdf ? 'PDF' : 'IMG'}
    </div>
  )
}

function prettyType(mime: string): string {
  switch (mime) {
    case 'application/pdf': return 'PDF'
    case 'image/jpeg':      return 'JPEG'
    case 'image/png':       return 'PNG'
    case 'image/heic':
    case 'image/heif':      return 'HEIC'
    default:                return mime
  }
}

function prettyBytes(n: number): string {
  if (n < 1024)        return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
