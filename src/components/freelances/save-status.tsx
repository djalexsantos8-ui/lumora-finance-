'use client'

/**
 * SaveStatus — indicador + botão manual de Salvar para o detalhe do freelance.
 *
 * Consome o SaveTracker (hook) do parent. Renderiza um único bloco compacto
 * que muda de aparência conforme estado:
 *
 *   · isSaving        → spinner + "Salvando…"
 *   · lastError       → ícone vermelho + "Falha ao salvar — Tentar"
 *   · lastSavedAt set → ✓ verde + "Salvo · HH:MM"
 *   · nunca salvou    → "Pronto para editar"
 *
 * Botão "Salvar" (manual):
 *   1. Desabilitado enquanto isSaving (evita empilhar requests)
 *   2. Chama `onManualSave` que:
 *      a. aguarda `waitForIdle()` (autosaves terminam)
 *      b. dispara persistência via `onSave` (callback do parent)
 *      c. atualiza timestamp
 *   3. Mutex `busy` local impede duplo-clique
 *
 * Acessibilidade:
 *   · aria-live="polite" no label para screen readers
 *   · title com timestamp completo
 */

import { useState } from 'react'
import { toast } from 'sonner'
import type { SaveTracker } from '@/hooks/use-save-tracker'

interface Props {
  tracker: SaveTracker
  /** Callback do parent — deve executar um save real (com track() interno). */
  onSave:  () => Promise<{ success: boolean; message?: string }>
  /** Desabilita o botão durante estados externos (ex: clientSwitching). */
  disabled?: boolean
}

export function SaveStatus({ tracker, onSave, disabled = false }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy || disabled) return
    setBusy(true)
    try {
      // 1. Aguarda qualquer autosave em andamento terminar.
      //    IMPORTANTE: waitForIdle resolve também em caso de falha dos
      //    autosaves (o contador é zerado no finally). Então NÃO inferir
      //    sucesso a partir daqui — quem decide é onSave() abaixo.
      await tracker.waitForIdle()

      // 2. Dispara persistência manual (parent faz round-trip real no backend).
      const res = await onSave()

      // 3. Feedback — apenas baseado na resposta REAL do onSave.
      //    Não chamamos markSuccess aqui: o tracker.track dentro do onSave
      //    já cuida do lastSavedAt/lastError. Se chamássemos markSuccess,
      //    estaríamos limpando um lastError legítimo de autosave anterior.
      if (res.success) {
        toast.success('Salvo com sucesso')
      } else {
        const msg = res.message || 'Erro ao salvar.'
        tracker.markError(msg)
        toast.error(msg)
      }
    } catch (err) {
      // Só cai aqui se onSave() lançar. Nosso handler atual captura internamente,
      // mas deixamos o catch como rede de segurança para implementações futuras.
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.'
      tracker.markError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const isWorking = busy || tracker.isSaving
  const hasError  = !!tracker.lastError
  const timeLabel = formatShortTime(tracker.lastSavedAt)

  return (
    <div className="flex items-center gap-2">
      {/* Indicador textual — "Salvo às HH:MM" / "Salvando…" / etc. */}
      <span
        aria-live="polite"
        title={tracker.lastSavedAt ? `Última atualização: ${formatFullTime(tracker.lastSavedAt)}` : undefined}
        className={`hidden md:flex items-center gap-1.5 text-[11px] select-none ${
          hasError
            ? 'text-red-400'
            : isWorking
              ? 'text-[#D4A853]'
              : tracker.lastSavedAt
                ? 'text-emerald-400'
                : 'text-[#525252]'
        }`}
      >
        {isWorking ? (
          <Spinner />
        ) : hasError ? (
          <IconAlert />
        ) : tracker.lastSavedAt ? (
          <IconCheck />
        ) : (
          <IconCloud />
        )}
        <span>
          {isWorking
            ? 'Salvando…'
            : hasError
              ? 'Falha ao salvar'
              : tracker.lastSavedAt
                ? `Salvo${timeLabel ? ` · ${timeLabel}` : ''}`
                : 'Autosave ativo'}
        </span>
      </span>

      {/* Botão manual */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isWorking || disabled}
        title={hasError ? 'Tentar salvar novamente' : 'Salvar alterações'}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          hasError
            ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/15'
            : 'bg-[#1c1c1c] text-white border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#262626]'
        }`}
      >
        {isWorking ? (
          <Spinner />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M5 13l4 4L19 7" />
          </svg>
        )}
        {hasError ? 'Tentar' : 'Salvar'}
      </button>
    </div>
  )
}

// ─── Ícones ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function IconCloud() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  )
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatShortTime(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatFullTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return iso
  }
}
