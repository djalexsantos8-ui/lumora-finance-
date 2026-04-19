'use client'

/**
 * ComprovantesList — sub-seção renderizada DENTRO de "Repasses ao cliente".
 *
 * Conceitualmente, comprovantes fazem parte do fluxo financeiro do repasse.
 * Por isso saíram da seção "Arquivos" separada e foram embutidos sob a
 * tabela de repasses. Sem card próprio — só um bloco com título + lista.
 *
 * Estado (lista) vem do pai (job-detail). Abrir arquivo cria signed URL
 * via server action (TTL 1h). Delete é otimista com rollback.
 */

import { useTransition } from 'react'
import { toast } from 'sonner'
import { deleteJobFile, createJobFileSignedUrl } from '@/lib/actions/job-files'
import type { JobFile } from '@/types/job-file'

interface Props {
  files: JobFile[]
  /** Remove otimista — pai decide (remove da lista antes do server). */
  onFileDeletedOptimistic: (fileId: string) => void
  /** Rollback otimista caso o delete falhe no server. */
  onFileDeleteRollback:    (file: JobFile) => void
}

export function ComprovantesList({
  files,
  onFileDeletedOptimistic,
  onFileDeleteRollback,
}: Props) {
  const [, startTransition] = useTransition()

  async function handleOpen(f: JobFile) {
    const res = await createJobFileSignedUrl(f.id)
    if (!res.success) {
      toast.error(res.message)
      return
    }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(f: JobFile) {
    if (!confirm(`Remover "${f.file_name}"?`)) return
    onFileDeletedOptimistic(f.id)
    startTransition(async () => {
      const res = await deleteJobFile(f.id)
      if (!res.success) {
        onFileDeleteRollback(f)
        toast.error(res.message)
      } else {
        toast.success('Comprovante removido')
      }
    })
  }

  // Sem comprovantes ainda → não renderiza nada. O botão "Comprovante" no
  // header do card já orienta o usuário.
  if (files.length === 0) return null

  return (
    <div className="mt-5 pt-4 border-t border-[#1f1f1f]">
      <div className="flex items-center gap-1.5 mb-2.5">
        <svg className="w-3.5 h-3.5 text-[#737373]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        <h3 className="text-xs font-semibold text-white">
          Comprovantes
          <span className="ml-1.5 text-[#525252] font-normal">({files.length})</span>
        </h3>
      </div>

      <ul className="divide-y divide-[#1f1f1f]">
        {files.map(f => (
          <FileRow key={f.id} file={f} onOpen={handleOpen} onDelete={handleDelete} />
        ))}
      </ul>
    </div>
  )
}

// ─── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({
  file, onOpen, onDelete,
}: {
  file:     JobFile
  onOpen:   (f: JobFile) => void
  onDelete: (f: JobFile) => void
}) {
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <FileIcon mime={file.mime_type} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(file)}
          className="text-xs text-white hover:text-[#E8C47A] transition-colors truncate max-w-full text-left"
          title={`Abrir ${file.file_name}`}
        >
          {file.file_name}
        </button>
        <p className="text-[10px] text-[#525252] mt-0.5">
          {prettyType(file.mime_type)} · {prettyBytes(file.size_bytes)}
        </p>
      </div>

      {/* Visualizar */}
      <button
        type="button"
        onClick={() => onOpen(file)}
        aria-label="Visualizar arquivo"
        title="Visualizar"
        className="text-[#525252] hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#1f1f1f]"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>

      {/* Remover */}
      <button
        type="button"
        onClick={() => onDelete(file)}
        aria-label="Remover arquivo"
        title="Remover"
        className="text-[#525252] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-[#1f1f1f]"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </li>
  )
}

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
