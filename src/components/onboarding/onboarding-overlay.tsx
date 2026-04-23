'use client'

// ─── Onboarding · Overlay ───────────────────────────────────────────────────
//
// Overlay único de primeiro acesso. Monta na raiz do (app)/layout quando o
// profile do usuário tem `onboarding_completed = false`. Controla 3 etapas:
//
//   1. welcome  → card de boas-vindas com CTA "Vamos lá"
//   2. company  → CompanyProfileForm (salva dados; avança)
//   3. tour     → ProductTour (slides por aba; termina em markCompleted)
//
// UX de fechamento:
//   · Botão "X" no header → skip imediato (markOnboardingSkipped)
//   · ESC → skip
//   · Clique no backdrop → NÃO fecha (evita perda acidental de contexto)
//
// Persistência: tudo mora no server (actions). Aqui só orquestramos UI.
// Após qualquer skip/complete, fazemos router.refresh() pra re-rodar o
// server layout e parar de montar o overlay.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markOnboardingCompleted,
  markOnboardingSkipped,
} from '@/lib/actions/onboarding'
import type { WorkspaceSettings } from '@/types/workspace-settings'
import CompanyProfileForm from './company-profile-form'
import ProductTour from './product-tour'

type Step = 'welcome' | 'company' | 'tour'

interface Props {
  workspaceId:  string
  userFirstName: string | null
  initialSettings: Partial<WorkspaceSettings> | null
  // Se o usuário já tinha dados da empresa (ex: novo membro entrando em
  // workspace existente), começamos direto no tour.
  startStep?:   Step
}

export default function OnboardingOverlay({
  workspaceId, userFirstName, initialSettings, startStep = 'welcome',
}: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(startStep)
  const [isSkipping, startSkip] = useTransition()
  const [isFinishing, startFinish] = useTransition()

  // ESC = skip
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trava scroll do body enquanto o overlay tá aberto
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleSkip() {
    if (isSkipping || isFinishing) return
    startSkip(async () => {
      await markOnboardingSkipped()
      router.refresh()
    })
  }

  function handleFinish() {
    startFinish(async () => {
      await markOnboardingCompleted()
      router.refresh()
    })
  }

  const headerTitle =
    step === 'welcome' ? 'Bem-vindo ao Lumora'
    : step === 'company' ? 'Vamos configurar sua empresa'
    : 'Conheça o Lumora em 60 segundos'

  const headerSubtitle =
    step === 'welcome' ? 'Menos planilha. Mais produção.'
    : step === 'company' ? 'Esses dados entram em propostas, contratos e PDFs.'
    : 'Dez abas, cada uma com um papel claro.'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-0 md:p-6 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-2xl max-h-full md:max-h-[92vh] overflow-y-auto bg-[#0a0a0a] md:bg-[#0d0d0d] md:border md:border-[#1f1f1f] md:rounded-3xl shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1f1f1f] px-5 md:px-7 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D4A853] mb-0.5">
              {step === 'welcome' ? 'Primeiro acesso' : step === 'company' ? 'Passo 1 de 2' : 'Passo 2 de 2'}
            </p>
            <h2 id="onboarding-title" className="text-lg font-bold text-white leading-tight">
              {headerTitle}
            </h2>
            <p className="text-xs text-[#a3a3a3] mt-0.5 leading-snug">
              {headerSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            disabled={isSkipping || isFinishing}
            aria-label="Pular onboarding"
            title="Pular — você pode reabrir em Configurações"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#737373] hover:text-white hover:bg-[#1c1c1c] transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 md:p-7">
          {step === 'welcome' && (
            <WelcomeStep
              firstName={userFirstName}
              onStart={() => setStep('company')}
              onSkip={handleSkip}
            />
          )}

          {step === 'company' && (
            <CompanyProfileForm
              workspaceId={workspaceId}
              initial={initialSettings ?? null}
              onSaved={() => setStep('tour')}
              onSkip={handleSkip}
            />
          )}

          {step === 'tour' && (
            <ProductTour
              onFinish={handleFinish}
              onSkip={handleSkip}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Welcome step ────────────────────────────────────────────────────────────
// Extraído aqui pra manter o overlay num arquivo só. É pequeno.

function WelcomeStep({
  firstName, onStart, onSkip,
}: { firstName: string | null; onStart: () => void; onSkip: () => void }) {
  const greeting = firstName
    ? `Tudo bem, ${firstName}?`
    : 'Tudo bem?'

  return (
    <div className="flex flex-col gap-5">
      {/* Hero card */}
      <div className="rounded-2xl bg-gradient-to-br from-[#D4A853]/15 via-[#D4A853]/5 to-transparent border border-[#D4A853]/20 p-5 md:p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">👋</span>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#E8C47A]">
            {greeting}
          </p>
        </div>
        <h3 className="text-xl md:text-2xl font-bold text-white leading-tight mb-2">
          Em 60 segundos o Lumora já fala sua língua.
        </h3>
        <p className="text-sm text-[#d4d4d4] leading-relaxed">
          Vamos configurar o básico da sua empresa e te apresentar cada aba do sistema.
          Rápido, direto — e você pode pular qualquer etapa.
        </p>
      </div>

      {/* Mini lista de o que vem */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <MiniItem
          icon="🏢"
          title="Dados da empresa"
          body="Logo, nome, contato — entra em todos os documentos."
        />
        <MiniItem
          icon="🧭"
          title="Tour rápido"
          body="10 abas, cada uma com um papel claro no seu negócio."
        />
      </ul>

      {/* Ações */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1f1f1f]">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs font-medium text-[#737373] hover:text-white transition-colors"
        >
          Pular por agora
        </button>

        <button
          type="button"
          onClick={onStart}
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          Vamos lá
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function MiniItem({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#101010] border border-[#1f1f1f]">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white mb-0.5">{title}</p>
        <p className="text-[11px] text-[#a3a3a3] leading-relaxed">{body}</p>
      </div>
    </li>
  )
}
