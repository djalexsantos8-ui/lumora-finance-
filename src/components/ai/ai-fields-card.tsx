'use client'

/**
 * AIFieldsCard — componente reutilizável "✨ Gerar com IA"
 *
 * Usado em:
 *   · /budgets/[id] — briefing → preenche title/client/desc/entregas/etc.
 *   · /pedidos/[id] — briefing → preenche title/client/desc/entregas/etc.
 *
 * Responsabilidades deste componente:
 *   · UI (card collapsible com textarea + botão Gerar)
 *   · Estado local (brief, loading, last quota, rationale)
 *   · Delega a action real pro callback `onGenerate(brief)`
 *   · Mostra contador "X/Y restantes" quando a action retorna quota
 *   · Toast pra erros (ai_disabled / limit_exceeded / parse_error)
 *
 * O caller mapeia os campos retornados pro setters do form. Isso
 * mantém o componente agnóstico ao payload (budget vs order).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getMyAIQuota } from '@/lib/ai/actions'
import type { AIQuota } from '@/lib/ai/quota'

export type AIFieldsCardResult<F> =
  | {
      success: true
      fields:  F
      quota:   AIQuota
      rationale?: string
    }
  | {
      success: false
      message: string
      reason?: string
      quota?:  AIQuota | null
    }

interface Props<F> {
  /** Chamada que dispara a action do servidor e retorna o resultado. */
  onGenerate: (brief: string) => Promise<AIFieldsCardResult<F>>
  /** Aplicar no form os campos gerados. Chamado apenas em success. */
  onApply:    (fields: F) => void
  /** Placeholder do textarea — contextualizar com o objeto (orçamento/pedido). */
  placeholder?: string
  /** Título do card. Default: "✨ Gerar com IA". */
  title?: string
  /** Hint secundária abaixo do título. */
  subtitle?: string
  /** Quota inicial (SSR). O componente atualiza depois de cada chamada. */
  initialQuota?: AIQuota | null
  /** Classe extra pro card externo, ex: espaçamento custom. */
  className?: string
}

export function AIFieldsCard<F>({
  onGenerate,
  onApply,
  placeholder,
  title    = '✨ Gerar com IA',
  subtitle = 'Descreva o projeto em poucas linhas. Vamos preencher os campos pra você revisar.',
  initialQuota,
  className,
}: Props<F>) {
  const [open, setOpen]         = useState(false)
  const [brief, setBrief]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [rationale, setRationale] = useState<string | null>(null)
  const [quota, setQuota]       = useState<AIQuota | null>(initialQuota ?? null)

  // Se SSR não entregou quota (timeout ou null), busca no cliente uma vez.
  // Deploy G (2026-04-22): garante que o contador apareça mesmo quando
  // getAIQuota no SSR fizer fallback pro default silenciosamente.
  useEffect(() => {
    if (quota) return
    let cancelled = false
    void (async () => {
      try {
        const res = await getMyAIQuota()
        if (!cancelled && res.success) setQuota(res.quota)
      } catch {
        // Silencioso — UI segue funcionando sem o contador.
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleGenerate() {
    const trimmed = brief.trim()
    if (trimmed.length < 10) {
      toast.error('Descreva um pouco mais o projeto (mínimo ~10 caracteres).')
      return
    }
    setLoading(true)
    setRationale(null)
    try {
      const res = await onGenerate(trimmed)
      if (!res.success) {
        if (res.quota) setQuota(res.quota)
        if (res.reason === 'limit_exceeded') {
          toast.error('Você atingiu o limite mensal de IA. Compre créditos em Configurações.')
        } else if (res.reason === 'ai_disabled') {
          toast.error('IA indisponível agora. Preencha manualmente.')
        } else {
          toast.error(res.message)
        }
        return
      }
      onApply(res.fields)
      setQuota(res.quota)
      setRationale((res as { rationale?: string }).rationale ?? null)
      toast.success('Campos preenchidos. Revise antes de salvar.')
    } catch (err) {
      console.error('[AIFieldsCard]', err)
      toast.error('Falha inesperada ao gerar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const remainingTxt = quota
    ? `${quota.remaining}/${quota.limit} gerações restantes em ${quota.period}`
    : null

  return (
    <div
      className={`bg-[#141414] border border-[#D4A853]/30 rounded-2xl overflow-hidden ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#1a1a1a] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[#E8C47A] text-sm font-semibold shrink-0">{title}</span>
          <span className="text-[11px] text-[#525252] truncate hidden sm:inline">{subtitle}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {remainingTxt && (
            <span
              className="text-[10px] font-medium text-[#a3a3a3] bg-[#0a0a0a] border border-[#2a2a2a] rounded-full px-2 py-0.5"
              title={`Período ${quota?.period}`}
            >
              {quota && quota.remaining === 0 ? 'Sem créditos' : remainingTxt}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-[#525252] transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3 border-t border-[#2a2a2a]">
          <p className="text-[11px] text-[#a3a3a3] sm:hidden">
            {subtitle}
          </p>
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder={placeholder ?? 'Ex: casamento Joao e Maria em 10/05, 6h de cobertura, 1 teaser + filme longo, entrega em 45d'}
            rows={4}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#525252] focus:outline-none focus:border-[#D4A853]/50 resize-y"
            disabled={loading}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-[#525252]">
              {quota && quota.remaining === 0
                ? 'Sem créditos nesse mês. Compre em Configurações > Créditos.'
                : 'Você revisa cada campo antes de salvar. Nada é gravado sem confirmação.'}
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || (quota?.remaining === 0)}
              className="text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg transition-colors"
            >
              {loading ? 'Gerando…' : 'Gerar com IA'}
            </button>
          </div>
          {rationale && (
            <div className="text-[11px] text-[#a3a3a3] bg-[#D4A853]/5 border border-[#D4A853]/20 rounded-lg px-3 py-2">
              <span className="text-[#E8C47A] font-medium">Por quê:</span> {rationale}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
