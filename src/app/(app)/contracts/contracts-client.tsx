'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { ContractTemplate } from '@/lib/data/contract-templates'

// ─── Contratos — cliente ──────────────────────────────────────────────────────
//
// Lista os 9 templates em cards clicáveis. Ao clicar, abre modal full-screen
// com o texto completo, botões "Copiar" e "Baixar .md". Usuário copia, cola
// no editor de texto (Word/Docs) e substitui os {{placeholders}} com dados
// reais do cliente e projeto.

interface Props {
  templates: ContractTemplate[]
}

const AUDIENCE_BADGE: Record<ContractTemplate['audience'], { label: string; cls: string }> = {
  pf:  { label: 'PF',  cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20'        },
  pj:  { label: 'PJ',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  any: { label: 'PF/PJ', cls: 'bg-[#2a2a2a] text-[#a3a3a3] border-[#2a2a2a]'      },
}

export default function ContractsClient({ templates }: Props) {
  const [open, setOpen] = useState<ContractTemplate | null>(null)

  return (
    <div className="min-h-full">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#1a1a1a] px-6 md:px-8 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-white">Contratos</h1>
            <p className="text-xs text-[#a3a3a3] mt-0.5 max-w-2xl">
              Modelos prontos pra copiar, adaptar e assinar. Use como ponto de partida —
              substitua os campos entre chaves pelos dados reais do seu cliente e projeto.
            </p>
          </div>
          <span className="text-[10px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/20 px-2 py-1 rounded-full tracking-wider">
            V1 · {templates.length} templates
          </span>
        </div>
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────────── */}
      <div className="mx-6 md:mx-8 mt-5 bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="text-xs text-amber-200 leading-relaxed">
          <strong className="text-amber-300">Importante — leia antes de usar.</strong>{' '}
          Esses modelos foram gerados com apoio de IA e cobrem os 80% mais comuns de um contrato
          de serviços audiovisuais no Brasil.{' '}
          <strong>Eles NÃO substituem assessoria jurídica.</strong>{' '}
          Antes de fechar um contrato relevante (especialmente B2B e valores altos), revise com
          um advogado. O Lumora Finance não se responsabiliza por lacunas, adaptações
          ou uso indevido desses modelos.
        </div>
      </div>

      {/* ── Grid de templates ─────────────────────────────────────────────── */}
      <div className="p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tpl => {
            const aud = AUDIENCE_BADGE[tpl.audience]
            return (
              <button
                key={tpl.id}
                onClick={() => setOpen(tpl)}
                className="text-left bg-[#141414] border border-[#2a2a2a] hover:border-[#D4A853]/40 rounded-2xl p-5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white group-hover:text-[#E8C47A] transition-colors leading-snug">
                    {tpl.title}
                  </h3>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${aud.cls}`}>
                    {aud.label}
                  </span>
                </div>
                <p className="text-xs text-[#a3a3a3] leading-relaxed">
                  {tpl.summary}
                </p>
                <div className="mt-3 flex items-center gap-1 text-[11px] text-[#525252] group-hover:text-[#D4A853] transition-colors">
                  Ver modelo
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Modal do template ─────────────────────────────────────────────── */}
      {open && (
        <TemplateModal template={open} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
function TemplateModal({
  template,
  onClose,
}: {
  template: ContractTemplate
  onClose: () => void
}) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(template.body)
      toast.success('Modelo copiado. Cole no Word/Docs e substitua os campos {{...}}.')
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.')
    }
  }

  function handleDownload() {
    const slug = template.id.replace(/_/g, '-')
    const blob = new Blob([template.body], { type: 'text/markdown;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `contrato-${slug}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-3xl my-8 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[#1a1a1a] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{template.title}</h2>
            <p className="text-xs text-[#a3a3a3] mt-0.5">{template.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#525252] hover:text-white transition-colors p-1"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — texto do contrato */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
            Campos entre <code className="text-amber-300">{'{{chaves}}'}</code> são placeholders — substitua pelos dados reais no seu editor de texto.
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[#e5e5e5]">
            {template.body}
          </pre>
        </div>

        {/* Footer — ações */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#1a1a1a] shrink-0">
          <button
            onClick={onClose}
            className="text-sm text-[#a3a3a3] hover:text-white transition-colors"
          >
            Fechar
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Baixar .md
            </button>
            <button
              onClick={handleCopy}
              className="text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copiar modelo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
