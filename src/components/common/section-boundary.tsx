'use client'

import { Component, type ReactNode } from 'react'

// ─── SectionBoundary ──────────────────────────────────────────────────────
//
// Motivo (2026-04-23): o bloco "→ Aprovar & Transformar" + "Gerar contrato"
// sumiu temporariamente pós-deploy pra usuários que deram hard refresh com
// chunks antigos em cache. React swallowa erros de render dentro do sub-tree
// do componente — a área some, mas não aparece nada em lugar nenhum.
//
// Este boundary garante que, se QUALQUER erro de render acontecer na seção,
// aparece um fallback com botão "Recarregar" em vez de bloco invisível.
// Sumiço silencioso nunca mais.

interface Props {
  /** Identifica a seção nos logs — ex: "ConversionPanel", "ContractEntryPoint". */
  label:    string
  children: ReactNode
  /**
   * Mensagem mostrada dentro do fallback. Opcional — default é genérica.
   */
  message?: string
}

interface State {
  error: Error | null
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // Log estruturado — facilita rastrear em prod via console do browser.
    console.error(`[SectionBoundary:${this.props.label}]`, error, info)
  }

  handleReload = () => {
    // Reload hard (pula cache) — força chunks frescos.
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-red-300">
                Esta seção não carregou corretamente
              </p>
              <p className="text-xs text-[#a3a3a3] mt-1">
                {this.props.message ??
                  'Um erro intermitente pode ter ocorrido após um deploy recente. Clique em recarregar para atualizar a página.'}
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
