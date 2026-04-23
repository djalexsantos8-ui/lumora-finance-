'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { upsertWorkspaceSettings } from '@/lib/actions/workspace-settings'
import { maskCNPJ, maskCPF, maskPhoneBR, maskCEP, maskUF } from '@/lib/utils/masks'
import { getMyAIQuota, getMyAIBalance } from '@/lib/ai/actions'
import type { AIQuota, AIBalance } from '@/lib/ai/quota'
import type { WorkspaceSettings } from '@/types/workspace-settings'

// ─── Settings — seções (pente fino 2026-04-21) ───────────────────────────────
// Ao invés de um form gigante vertical, dividimos em seções navegáveis:
//   · Identidade  (logo + nome da marca)
//   · Empresa     (dados que saem nos documentos: assinatura, rodapé)
//   · Notificações (placeholder V1 — só aviso do que vem aí)

type SectionId = 'identity' | 'company' | 'notifications' | 'credits'

const SECTIONS: { id: SectionId; label: string; icon: ReactNode; description: string }[] = [
  {
    id: 'identity',
    label: 'Identidade',
    description: 'Logo e nome da sua marca — aparece em todos os documentos.',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'company',
    label: 'Empresa',
    description: 'Dados que saem na assinatura e no rodapé dos PDFs.',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notificações',
    description: 'Lembretes, avisos de pagamento e alertas de agenda.',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    id: 'credits',
    label: 'Créditos',
    description: 'Quota mensal de IA (gerar orçamentos e pedidos automaticamente).',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
]

interface Props {
  settings:    WorkspaceSettings | null
  workspaceId: string
}

export default function SettingsForm({ settings, workspaceId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [section, setSection] = useState<SectionId>('identity')

  // Logo state
  const [logoUrl,       setLogoUrl]       = useState(settings?.company_logo_url ?? '')
  const [logoPreview,   setLogoPreview]   = useState(settings?.company_logo_url ?? '')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError,     setLogoError]     = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form values
  const [companyName,    setCompanyName]    = useState(settings?.company_name    ?? '')
  const [signatureName,  setSignatureName]  = useState(settings?.signature_name  ?? '')
  const [signatureTitle, setSignatureTitle] = useState(settings?.signature_title ?? '')
  const [footerText,     setFooterText]     = useState(settings?.footer_text     ?? '')

  // Dados contratuais (para Contract Builder)
  const [companyLegalName,   setCompanyLegalName]   = useState(settings?.company_legal_name   ?? '')
  const [companyCnpj,        setCompanyCnpj]        = useState(settings?.company_cnpj         ?? '')
  const [companyCpf,         setCompanyCpf]         = useState(settings?.company_cpf          ?? '')
  const [companyAddressLine, setCompanyAddressLine] = useState(settings?.company_address_line ?? '')
  const [companyAddressCity, setCompanyAddressCity] = useState(settings?.company_address_city ?? '')
  const [companyAddressState, setCompanyAddressState] = useState(settings?.company_address_state ?? '')
  const [companyAddressZip,  setCompanyAddressZip]  = useState(settings?.company_address_zip  ?? '')
  const [companyEmail,       setCompanyEmail]       = useState(settings?.company_email        ?? '')
  const [companyPhone,       setCompanyPhone]       = useState(settings?.company_phone        ?? '')
  const [defaultNoticeDays,  setDefaultNoticeDays]  = useState(
    settings?.default_cancellation_notice_days?.toString() ?? '30'
  )
  const [defaultPenaltyPct,  setDefaultPenaltyPct]  = useState(
    settings?.default_cancellation_penalty_pct?.toString() ?? '50'
  )

  // ─── quota de IA (aba Créditos) ─────────────────────────────────────────────
  // Fetch on demand quando o usuário abrir a aba — evita round-trip em abas
  // que 99% dos usuários não visitam. Refetch manual via botão "Atualizar".
  const [quota, setQuota]             = useState<AIQuota | null>(null)
  const [balance, setBalance]         = useState<AIBalance | null>(null)
  const [loadingQuota, setLoadingQuota] = useState(false)
  const [quotaError, setQuotaError]   = useState<string | null>(null)

  async function fetchQuota() {
    setLoadingQuota(true)
    setQuotaError(null)
    try {
      // Deploy H (2026-04-23): buscamos o breakdown (granted/purchased/included).
      // Se a migration ainda não rodou em prod, getMyAIBalance retorna
      // granted=0/purchased=0 e o included vira o quota antigo (fallback).
      const balRes = await getMyAIBalance()
      if (balRes.success) {
        const b = balRes.balance
        setBalance(b)
        setQuota({
          period:    b.period,
          used:      b.included_used,
          limit:     b.included_limit,
          remaining: b.included_remaining,
        })
      } else {
        // Fallback extra: tenta o quota antigo (caso admin-actions indisponível)
        const res = await getMyAIQuota()
        if (res.success) setQuota(res.quota)
        else setQuotaError(balRes.message)
      }
    } catch {
      setQuotaError('Não foi possível carregar a quota agora.')
    } finally {
      setLoadingQuota(false)
    }
  }

  useEffect(() => {
    if (section === 'credits' && !quota && !loadingQuota) {
      void fetchQuota()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  // ─── logo upload ───────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoError(null)

    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Arquivo muito grande. Máximo 2MB.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setLogoError('Selecione uma imagem (PNG, JPG, SVG).')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setLogoPreview(objectUrl)
    setUploadingLogo(true)

    const supabase = createClient()
    const extension = file.name.split('.').pop() ?? 'png'
    const path = `${workspaceId}/logo.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('brand')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      console.error('[logo/upload]', uploadError)
      setLogoError(
        uploadError.message.includes('Bucket not found')
          ? 'Bucket "brand" não encontrado. Crie-o no Supabase Storage (público).'
          : 'Erro ao fazer upload. Tente novamente.'
      )
      setLogoPreview(logoUrl)
      setUploadingLogo(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('brand')
      .getPublicUrl(path)

    const finalUrl = `${publicUrl}?t=${Date.now()}`
    setLogoUrl(finalUrl)
    setLogoPreview(finalUrl)
    setUploadingLogo(false)
  }

  function handleRemoveLogo() {
    setLogoUrl('')
    setLogoPreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── form submit ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setToast(null)

    const formData = new FormData(e.currentTarget)
    formData.set('company_logo_url', logoUrl)

    startTransition(async () => {
      const result = await upsertWorkspaceSettings(formData)
      if (result.success) {
        setToast({ type: 'success', message: 'Configurações salvas com sucesso!' })
        setTimeout(() => setToast(null), 4000)
      } else {
        setToast({ type: 'error', message: result.message })
      }
    })
  }

  // ─── render ─────────────────────────────────────────────────────────────────

  const currentSection = SECTIONS.find(s => s.id === section)!

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
      {/* Sidebar de seções */}
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {SECTIONS.map(s => {
          const active = s.id === section
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-xl transition-colors shrink-0 md:w-full md:text-left ${
                active
                  ? 'bg-[#D4A853]/10 text-[#E8C47A] border border-[#D4A853]/30'
                  : 'text-[#a3a3a3] hover:text-white hover:bg-[#1c1c1c] border border-transparent'
              }`}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          )
        })}
      </nav>

      <div>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white">{currentSection.label}</h2>
          <p className="text-xs text-[#525252] mt-0.5">{currentSection.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ─── Identidade ──────────────────────────────────────────────── */}
          {section === 'identity' && (
            <>
              {/* Logo */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-[#a3a3a3] tracking-wider uppercase mb-4">Logotipo</h3>

                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center shrink-0 overflow-hidden relative">
                    {logoPreview ? (
                      <Image
                        src={logoPreview}
                        alt="Logo da empresa"
                        fill
                        className="object-contain p-2"
                        unoptimized
                      />
                    ) : (
                      <svg className="w-8 h-8 text-[#3a3a3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    {uploadingLogo && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
                        <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <input type="hidden" name="company_logo_url" value={logoUrl} />

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="text-sm font-medium text-[#D4A853] hover:text-[#E8C47A] disabled:opacity-50 transition-colors"
                      >
                        {logoPreview ? 'Trocar logo' : 'Fazer upload'}
                      </button>
                      {logoPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="text-sm text-[#525252] hover:text-red-400 transition-colors"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#525252] mt-1.5">PNG, JPG ou SVG. Máximo 2MB.</p>
                    {logoError && (
                      <p className="text-xs text-red-400 mt-1">{logoError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Nome da marca */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-[#a3a3a3] tracking-wider uppercase mb-4">Nome da marca</h3>
                <div>
                  <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                    Nome da empresa / marca pessoal
                  </label>
                  <input
                    type="text"
                    name="company_name"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Ex: João Filmes, Studio Alpha, Freelancer…"
                    maxLength={120}
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {/* ─── Empresa (assinatura/rodapé + contratuais) ──────────────── */}
          {section === 'company' && (
            <>
              {/* Dados contratuais — usados pelo Contract Builder */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#a3a3a3] tracking-wider uppercase">Dados contratuais da empresa</h3>
                  <span className="text-[9px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/20 px-2 py-0.5 rounded-full tracking-wider">
                    CONTRATOS
                  </span>
                </div>
                <p className="text-xs text-[#a3a3a3] leading-relaxed -mt-2">
                  Esses dados vão preencher automaticamente a parte da <strong>CONTRATADA</strong> em todos os contratos que você gerar.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">Razão social</label>
                    <input type="text" name="company_legal_name" value={companyLegalName}
                      onChange={e => setCompanyLegalName(e.target.value)}
                      placeholder="Nome jurídico registrado da empresa" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">CNPJ</label>
                    <input type="text" name="company_cnpj" value={companyCnpj}
                      onChange={e => setCompanyCnpj(maskCNPJ(e.target.value))}
                      placeholder="00.000.000/0000-00" inputMode="numeric" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">CPF (se MEI/autônomo)</label>
                    <input type="text" name="company_cpf" value={companyCpf}
                      onChange={e => setCompanyCpf(maskCPF(e.target.value))}
                      placeholder="000.000.000-00" inputMode="numeric" className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">Endereço</label>
                    <input type="text" name="company_address_line" value={companyAddressLine}
                      onChange={e => setCompanyAddressLine(e.target.value)}
                      placeholder="Rua, número, complemento, bairro" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">Cidade</label>
                    <input type="text" name="company_address_city" value={companyAddressCity}
                      onChange={e => setCompanyAddressCity(e.target.value)}
                      placeholder="São Paulo" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">UF</label>
                      <input type="text" name="company_address_state" value={companyAddressState}
                        onChange={e => setCompanyAddressState(maskUF(e.target.value))}
                        placeholder="SP" maxLength={2} className={`${inputCls} uppercase`} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">CEP</label>
                      <input type="text" name="company_address_zip" value={companyAddressZip}
                        onChange={e => setCompanyAddressZip(maskCEP(e.target.value))}
                        placeholder="00000-000" inputMode="numeric" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">E-mail comercial</label>
                    <input type="email" name="company_email" value={companyEmail}
                      onChange={e => setCompanyEmail(e.target.value)}
                      placeholder="contato@empresa.com.br" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">Telefone</label>
                    <input type="text" name="company_phone" value={companyPhone}
                      onChange={e => setCompanyPhone(maskPhoneBR(e.target.value))}
                      placeholder="(11) 99999-9999" inputMode="tel" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">Aviso prévio (dias)</label>
                    <input type="number" name="default_cancellation_notice_days" value={defaultNoticeDays}
                      onChange={e => setDefaultNoticeDays(e.target.value)}
                      placeholder="30" min="0" max="365" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">Multa cancelamento (%)</label>
                    <input type="number" name="default_cancellation_penalty_pct" value={defaultPenaltyPct}
                      onChange={e => setDefaultPenaltyPct(e.target.value)}
                      placeholder="50" min="0" max="100" step="0.1" className={inputCls} />
                  </div>
                </div>
              </div>

              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-[#a3a3a3] tracking-wider uppercase">Assinatura nos documentos</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                      Nome para assinatura
                    </label>
                    <input
                      type="text"
                      name="signature_name"
                      value={signatureName}
                      onChange={e => setSignatureName(e.target.value)}
                      placeholder="João da Silva"
                      maxLength={100}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                      Título / função
                    </label>
                    <input
                      type="text"
                      name="signature_title"
                      value={signatureTitle}
                      onChange={e => setSignatureTitle(e.target.value)}
                      placeholder="Diretor de Fotografia"
                      maxLength={100}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                    Rodapé dos documentos
                  </label>
                  <textarea
                    name="footer_text"
                    rows={2}
                    value={footerText}
                    onChange={e => setFooterText(e.target.value)}
                    placeholder="Ex: Este orçamento é válido por 15 dias. Para aceite, responder por e-mail."
                    maxLength={300}
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </div>
            </>
          )}

          {/* ─── Créditos de IA (Deploy G 2026-04-22) ───────────────────── */}
          {section === 'credits' && (
            <div className="space-y-4">
              {/* Card principal: quota atual */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Quota do mês atual
                    </h3>
                    <p className="text-xs text-[#525252] mt-0.5">
                      {quota?.period
                        ? `Período: ${quota.period}`
                        : 'Carregando período…'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchQuota}
                    disabled={loadingQuota}
                    className="text-xs text-[#D4A853] hover:text-[#E8C47A] disabled:opacity-50 transition-colors"
                  >
                    {loadingQuota ? 'Atualizando…' : 'Atualizar'}
                  </button>
                </div>

                {quotaError ? (
                  <p className="text-xs text-red-400">{quotaError}</p>
                ) : quota ? (
                  <>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-3xl font-bold text-[#D4A853]">
                        {quota.remaining}
                      </span>
                      <span className="text-sm text-[#a3a3a3]">
                        / {quota.limit} créditos restantes
                      </span>
                    </div>
                    {/* Barra de progresso — o que já foi usado */}
                    <div className="w-full h-2 bg-[#1c1c1c] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#D4A853] transition-all duration-300"
                        style={{
                          width:
                            quota.limit > 0
                              ? `${Math.min(100, (quota.used / quota.limit) * 100)}%`
                              : '0%',
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-[#525252] mt-2">
                      {quota.used} usados este mês · reseta no dia 1º do próximo mês
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[#525252]">
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Carregando quota…
                  </div>
                )}
              </div>

              {/* ─ Créditos extras (Deploy H 2026-04-23) ────────────────────
                  Só aparece quando admin concedeu cortesia OU usuário comprou
                  pacote extra. Usa o breakdown de getMyAIBalance. */}
              {balance && (balance.granted + balance.purchased) > 0 && (
                <div className="bg-gradient-to-br from-[#D4A853]/10 to-[#141414] border border-[#D4A853]/30 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/20 px-2 py-0.5 rounded-full tracking-wider">
                      EXTRAS
                    </span>
                    <h3 className="text-sm font-semibold text-white">
                      Créditos que não expiram no fim do mês
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {balance.granted > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">
                          Cortesia
                        </div>
                        <div className="text-2xl font-bold text-[#D4A853] tabular-nums">
                          +{balance.granted}
                        </div>
                        <div className="text-[10px] text-[#525252] mt-0.5">
                          concedidos pelo time Lumora
                        </div>
                      </div>
                    )}
                    {balance.purchased > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">
                          Comprados
                        </div>
                        <div className="text-2xl font-bold text-[#D4A853] tabular-nums">
                          +{balance.purchased}
                        </div>
                        <div className="text-[10px] text-[#525252] mt-0.5">
                          pacotes extras via Stripe
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-[#a3a3a3] mt-4 leading-relaxed">
                    <strong className="text-white">Saldo total disponível: {balance.total_remaining} crédito{balance.total_remaining === 1 ? '' : 's'}.</strong>{' '}
                    Usamos primeiro os extras (cortesia + comprados), depois o seu
                    plano mensal. Extras não expiram no fim do mês.
                  </p>
                </div>
              )}

              {/* Explicação do que conta como crédito */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-[#a3a3a3] tracking-wider uppercase mb-3">
                  O que consome crédito
                </h3>
                <ul className="space-y-2 text-xs text-[#a3a3a3] leading-relaxed">
                  {[
                    '1 geração de orçamento via "✨ Gerar com IA" = 1 crédito',
                    '1 geração de pedido via "✨ Gerar com IA" = 1 crédito',
                    'Editar, salvar ou converter (orçamento → pedido/freelance) NÃO consome crédito',
                    'Visualizar dashboard, relatórios e insights NÃO consome crédito',
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#D4A853] mt-0.5">·</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Plano atual + CTA "em breve" */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[9px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/20 px-2 py-0.5 rounded-full tracking-wider">
                    PLANO BETA
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">
                  100 créditos gratuitos por mês
                </h3>
                <p className="text-xs text-[#a3a3a3] leading-relaxed mb-4">
                  Durante o beta, todo workspace recebe 100 créditos mensais gratuitos —
                  mais que suficiente pra gerar ~3 orçamentos por dia.
                </p>
                <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#d4d4d4] mb-1">
                    Em breve: pacotes extras
                  </p>
                  <p className="text-[11px] text-[#525252] leading-relaxed">
                    Se 100 créditos não forem suficientes, você vai poder comprar
                    pacotes de 50 / 200 / 500 créditos adicionais que não expiram
                    no fim do mês. Nos próximos deploys.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Notificações (placeholder V1) ───────────────────────────── */}
          {section === 'notifications' && (
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/20 px-2 py-0.5 rounded-full tracking-wider">
                  EM BREVE
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">
                Alertas e lembretes inteligentes
              </h3>
              <p className="text-xs text-[#a3a3a3] leading-relaxed mb-4">
                Em breve você vai poder configurar aqui:
              </p>
              <ul className="space-y-2 text-xs text-[#a3a3a3] leading-relaxed">
                {[
                  'Lembrete automático de pagamentos pendentes (7 / 3 / 1 dia antes)',
                  'Aviso quando um orçamento enviado completar X dias sem resposta',
                  'Alerta quando o prazo de entrega de um freelance se aproximar',
                  'Notificação semanal com resumo do pipeline (orçamentos, pedidos, freelances)',
                  'Integração com e-mail e/ou WhatsApp',
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[#525252] mt-0.5">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-[#525252] mt-4 italic">
                Por enquanto o Lumora Finance não envia nenhuma notificação automática.
                Os lembretes contam como próxima grande onda de funcionalidades.
              </p>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium border ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}
            >
              {toast.message}
            </div>
          )}

          {/* Submit — só aparece nas seções editáveis */}
          {section !== 'notifications' && section !== 'credits' && (
            <button
              type="submit"
              disabled={isPending || uploadingLogo}
              className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              {isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Salvando…
                </>
              ) : (
                'Salvar configurações'
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 ' +
  'focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
