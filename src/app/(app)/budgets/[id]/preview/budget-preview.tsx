'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatCurrency } from '@/lib/utils/format'
import type { Budget, BudgetItem } from '@/types/budget'
import type { WorkspaceSettings } from '@/types/workspace-settings'

interface Props {
  budget:   Budget
  settings: WorkspaceSettings | null
  items:    BudgetItem[]
}

export default function BudgetPreview({ budget, settings, items }: Props) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/budgets/${budget.id}/pdf`)
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${slugify(budget.title)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setDownloading(false)
    }
  }

  const companyName = settings?.company_name
  const logoUrl     = settings?.company_logo_url
  const sigName     = settings?.signature_name
  const sigTitle    = settings?.signature_title
  const footer      = settings?.footer_text

  const createdAt = new Date(budget.created_at)
  const createdFormatted = `${String(createdAt.getDate()).padStart(2, '0')}/${
    String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`

  function formatDate(iso: string | null) {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="min-h-full flex flex-col bg-[#0a0a0a]">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-[#1a1a1a] px-6 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/budgets/${budget.id}`}
            className="text-[#525252] hover:text-white transition-colors"
            title="Voltar ao editor"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-sm text-[#a3a3a3]">
            Preview — <span className="text-white">{budget.title}</span>
          </span>
        </div>

        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
        >
          {downloading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Gerando PDF…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Baixar PDF
            </>
          )}
        </button>
      </div>

      {/* ── Paper document ───────────────────────────────────────────────── */}
      <div className="flex-1 flex justify-center py-10 px-4">
        <div
          className="w-full max-w-[640px] bg-white shadow-2xl rounded-sm"
          style={{ minHeight: 900 }}
        >

          {/* ── Página 1: Capa ─────────────────────────────────────────── */}
          <div className="px-16 py-14 border-b border-gray-100" style={{ minHeight: 600 }}>
            {/* Header capa: logo + company */}
            <div className="flex items-start justify-between mb-12">
              <div>
                {logoUrl ? (
                  <div className="relative w-16 h-16">
                    <Image
                      src={logoUrl}
                      alt={companyName ?? 'Logo'}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                    <span className="text-xs text-gray-400">Logo</span>
                  </div>
                )}
              </div>
              {companyName && (
                <p className="text-sm font-bold text-gray-800 tracking-wider text-right">
                  {companyName.toUpperCase()}
                </p>
              )}
            </div>

            {/* Título */}
            <h1 className="text-4xl font-bold text-gray-900 leading-tight mb-2">
              Proposta
            </h1>
            <h1 className="text-4xl font-bold text-gray-900 leading-tight mb-8">
              Comercial
            </h1>
            <div className="w-12 h-0.5 bg-[#D4A853] mb-10" />

            {/* Meta */}
            <div className="space-y-3">
              <div className="flex items-baseline gap-6">
                <span className="text-xs font-bold text-gray-400 tracking-widest w-24 shrink-0">PARA</span>
                <span className="text-base text-gray-900">{budget.client_name || '—'}</span>
              </div>
              <div className="flex items-baseline gap-6">
                <span className="text-xs font-bold text-gray-400 tracking-widest w-24 shrink-0">PROJETO</span>
                <span className="text-base text-gray-900">{budget.title}</span>
              </div>
              <div className="flex items-baseline gap-6">
                <span className="text-xs font-bold text-gray-400 tracking-widest w-24 shrink-0">DATA</span>
                <span className="text-base text-gray-900">{createdFormatted}</span>
              </div>
              {budget.valid_until && (
                <div className="flex items-baseline gap-6">
                  <span className="text-xs font-bold text-gray-400 tracking-widest w-24 shrink-0">VÁLIDO ATÉ</span>
                  <span className="text-base text-gray-900">{formatDate(budget.valid_until)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Página 2: Sobre o Projeto ─────────────────────────────── */}
          {(budget.project_description || budget.deliverables) && (
            <div className="px-16 py-14 border-b border-gray-100">
              {/* Header */}
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800 tracking-wider">
                  {companyName?.toUpperCase() ?? 'PROPOSTA COMERCIAL'}
                </span>
                <span className="text-xs text-gray-400">Sobre o Projeto</span>
              </div>

              {budget.project_description && (
                <div className="mb-8">
                  <p className="text-[10px] font-bold text-[#D4A853] tracking-[3px] mb-3">DESCRIÇÃO</p>
                  <div className="h-px bg-gray-100 mb-4" />
                  <p className="text-sm text-gray-700 leading-relaxed">{budget.project_description}</p>
                </div>
              )}

              {budget.deliverables && (
                <div className="mb-8">
                  <p className="text-[10px] font-bold text-[#D4A853] tracking-[3px] mb-3">ENTREGAS</p>
                  <div className="h-px bg-gray-100 mb-4" />
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{budget.deliverables}</p>
                </div>
              )}

              {budget.event_date && (
                <div>
                  <p className="text-[10px] font-bold text-[#D4A853] tracking-[3px] mb-3">
                    {budget.is_multi_day && budget.event_date_end && budget.event_date_end !== budget.event_date
                      ? 'PERÍODO DO EVENTO'
                      : 'DATA DO EVENTO'}
                  </p>
                  <div className="h-px bg-gray-100 mb-4" />
                  <p className="text-sm text-gray-700">
                    {budget.is_multi_day && budget.event_date_end && budget.event_date_end !== budget.event_date
                      ? `${formatDate(budget.event_date)} a ${formatDate(budget.event_date_end)}`
                      : formatDate(budget.event_date)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Página 3: Investimento ────────────────────────────────── */}
          <div className="px-16 py-14">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-800 tracking-wider">
                {companyName?.toUpperCase() ?? 'PROPOSTA COMERCIAL'}
              </span>
              <span className="text-xs text-gray-400">Investimento</span>
            </div>

            {/* Itens visíveis */}
            {items.length > 0 && (
              <div className="mb-8">
                <p className="text-[10px] font-bold text-[#D4A853] tracking-[3px] mb-3">O QUE ESTÁ INCLUÍDO</p>
                <div className="h-px bg-gray-100 mb-4" />
                <ul className="space-y-2">
                  {items.map(item => (
                    <li key={item.id} className="flex items-start gap-3">
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#D4A853] shrink-0" />
                      <span className="text-sm text-gray-700">{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Total em destaque */}
            <div className="bg-gray-50 border-l-4 border-[#D4A853] px-6 py-6 rounded-r-lg mb-10">
              <p className="text-[10px] font-bold text-gray-400 tracking-[3px] mb-3">INVESTIMENTO TOTAL</p>
              <p className="text-5xl font-bold text-gray-900 tracking-tight leading-none">
                {formatCurrency(budget.total, budget.currency)}
              </p>
              <p className="text-xs text-gray-400 mt-2">Valor total do projeto</p>
            </div>

            {/* Assinatura */}
            {(sigName || sigTitle) && (
              <div className="mt-10 pt-4 border-t border-gray-200">
                <div className="w-40 h-px bg-gray-800 mb-2" />
                {sigName  && <p className="text-sm font-bold text-gray-800">{sigName}</p>}
                {sigTitle && <p className="text-xs text-gray-400 mt-0.5">{sigTitle}</p>}
              </div>
            )}

            {/* Footer */}
            {footer && (
              <p className="text-xs text-gray-400 mt-8 text-center leading-relaxed border-t border-gray-100 pt-6">
                {footer}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Nota sobre itens ocultos ──────────────────────────────────────── */}
      <div className="text-center pb-8">
        <p className="text-xs text-[#3a3a3a]">
          O breakdown de custos não é exibido neste documento.
          {items.length === 0
            ? ' Nenhum item está marcado para aparecer no PDF.'
            : ` ${items.length} item${items.length !== 1 ? 'ns' : ''} visível${items.length !== 1 ? 'is' : ''}.`}
        </p>
      </div>
    </div>
  )
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'orcamento'
}
