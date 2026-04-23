'use client'

// ─── Onboarding · CompanyProfileForm ────────────────────────────────────────
//
// Etapa 2 do onboarding. Três blocos de campos agrupados por sentido:
//   A · Identidade  → logo, nome fantasia, razão social, CNPJ/CPF
//   B · Contato     → email, telefone, site, instagram
//   C · Fiscais     → (opcional, colapsado) inscrições, regime, endereço
//
// Upload de logo reusa o mesmo padrão do settings-form (bucket 'brand',
// 2MB, path workspaceId/logo.ext). Nada é obrigatório exceto nome da empresa
// — podemos sempre expandir depois. Primeiro valor > cadastro perfeito.

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { saveCompanyProfile, type CompanyProfilePayload } from '@/lib/actions/onboarding'
import { submitWithOfflineGuard } from '@/lib/utils/offline-submit'
import type { WorkspaceSettings } from '@/types/workspace-settings'

interface Props {
  workspaceId: string
  initial?:    Partial<WorkspaceSettings> | null
  onSaved:     () => void          // avança pro próximo passo
  onSkip:      () => void          // pula o onboarding inteiro
}

export default function CompanyProfileForm({ workspaceId, initial, onSaved, onSkip }: Props) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [showFiscal, setShowFiscal] = useState(false)

  // Logo state (mesmo padrão do settings-form)
  const [logoUrl, setLogoUrl]     = useState(initial?.company_logo_url ?? '')
  const [logoPreview, setLogoPrev] = useState(initial?.company_logo_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Identidade
  const [companyName,  setCompanyName]  = useState(initial?.company_name       ?? '')
  const [tradeName,    setTradeName]    = useState(initial?.company_trade_name ?? '')
  const [legalName,    setLegalName]    = useState(initial?.company_legal_name ?? '')
  const [cnpj,         setCnpj]         = useState(initial?.company_cnpj       ?? '')
  const [cpf,          setCpf]          = useState(initial?.company_cpf        ?? '')

  // Contato
  const [email,        setEmail]        = useState(initial?.company_email      ?? '')
  const [phone,        setPhone]        = useState(initial?.company_phone      ?? '')
  const [website,      setWebsite]      = useState(initial?.company_website    ?? '')
  const [instagram,    setInstagram]    = useState(initial?.company_instagram  ?? '')

  // Fiscais / endereço (C)
  const [addrLine,     setAddrLine]     = useState(initial?.company_address_line  ?? '')
  const [addrCity,     setAddrCity]     = useState(initial?.company_address_city  ?? '')
  const [addrState,    setAddrState]    = useState(initial?.company_address_state ?? '')
  const [addrZip,      setAddrZip]      = useState(initial?.company_address_zip   ?? '')
  const [municipalReg, setMunicipalReg] = useState(initial?.company_municipal_registration ?? '')
  const [stateReg,     setStateReg]     = useState(initial?.company_state_registration     ?? '')
  const [taxRegime,    setTaxRegime]    = useState(initial?.company_tax_regime             ?? '')
  const [billingNotes, setBillingNotes] = useState(initial?.company_billing_notes          ?? '')

  // ─── logo upload ───────────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(null)

    if (file.size > 2 * 1024 * 1024) { setLogoError('Máximo 2MB.'); return }
    if (!file.type.startsWith('image/')) { setLogoError('Selecione uma imagem.'); return }

    const objectUrl = URL.createObjectURL(file)
    setLogoPrev(objectUrl)
    setUploading(true)

    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${workspaceId}/logo.${ext}`

    const { error } = await supabase.storage
      .from('brand')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (error) {
      console.error('[onboarding/logo]', error)
      setLogoError('Erro ao enviar. Tente novamente.')
      setLogoPrev(logoUrl)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('brand').getPublicUrl(path)
    const finalUrl = `${publicUrl}?t=${Date.now()}`
    setLogoUrl(finalUrl)
    setLogoPrev(finalUrl)
    setUploading(false)
  }

  function removeLogo() {
    setLogoUrl('')
    setLogoPrev('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // ─── submit ────────────────────────────────────────────────────────────────

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setToast(null)

    // Validação mínima: só o nome é obrigatório. Confiamos no usuário
    // — ele tá literalmente configurando a própria empresa.
    if (!companyName.trim()) {
      setToast('Informe ao menos o nome da empresa.')
      return
    }

    const payload: CompanyProfilePayload = {
      company_name:       companyName,
      company_trade_name: tradeName,
      company_legal_name: legalName,
      company_cnpj:       cnpj,
      company_cpf:        cpf,
      company_logo_url:   logoUrl,
      company_email:      email,
      company_phone:      phone,
      company_website:    website,
      company_instagram:  instagram,
      company_address_line:  addrLine,
      company_address_city:  addrCity,
      company_address_state: addrState,
      company_address_zip:   addrZip,
      company_municipal_registration: municipalReg,
      company_state_registration:     stateReg,
      company_tax_regime:             taxRegime,
      company_billing_notes:          billingNotes,
    }

    startTransition(async () => {
      const guard = await submitWithOfflineGuard(
        () => saveCompanyProfile(payload),
        { timeoutMs: 8000 },
      )
      if (!guard.ok) {
        setToast(guard.message)
        return
      }
      if (guard.data.success) onSaved()
      else setToast(guard.data.message)
    })
  }

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">

      {/* A · Identidade ────────────────────────────────────────────── */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D4A853] mb-3">
          Identidade
        </h3>

        {/* Logo */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center shrink-0 overflow-hidden relative">
            {logoPreview ? (
              <Image src={logoPreview} alt="Logo" fill className="object-contain p-1.5" unoptimized />
            ) : (
              <svg className="w-6 h-6 text-[#3a3a3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>

          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs font-medium bg-[#D4A853]/10 hover:bg-[#D4A853]/20 text-[#E8C47A] border border-[#D4A853]/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {logoPreview ? 'Trocar logo' : 'Adicionar logo'}
              </button>
              {logoPreview && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="text-xs text-[#737373] hover:text-white px-2 py-1.5 transition-colors"
                >
                  Remover
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#525252] mt-1.5">PNG, JPG ou SVG · até 2MB</p>
            {logoError && <p className="text-[10px] text-red-400 mt-1">{logoError}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nome da empresa *" hint="Como aparece no sistema">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex: Lumora Filmes"
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
          <Field label="Nome fantasia" hint="Opcional — se for diferente">
            <input
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="Ex: Lumora Productions"
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
          <Field label="Razão social" hint="Usado em contratos">
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Ex: Lumora Produções Ltda."
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
          <Field label="CNPJ ou CPF" hint="O que fizer sentido pra você">
            <div className="flex gap-2">
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="CNPJ"
                className="flex-1 bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
              />
              <input
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="ou CPF"
                className="flex-1 bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
              />
            </div>
          </Field>
        </div>
      </section>

      {/* B · Contato ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D4A853] mb-3">
          Contato
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="E-mail" hint="Aparece nas propostas">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contato@lumora.com.br"
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
          <Field label="Telefone" hint="Com DDD">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
          <Field label="Site" hint="Opcional">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="lumora.com.br"
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
          <Field label="Instagram" hint="@handle">
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@lumorafilmes"
              className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
            />
          </Field>
        </div>
      </section>

      {/* C · Fiscais ─────────────────────────────────────────────── */}
      <section>
        <button
          type="button"
          onClick={() => setShowFiscal((v) => !v)}
          className="flex items-center gap-2 text-[11px] font-medium text-[#a3a3a3] hover:text-white transition-colors"
        >
          <span>{showFiscal ? '− Ocultar' : '+ Adicionar'} endereço e dados fiscais</span>
          <span className="text-[10px] text-[#525252]">(opcional, pra contratos)</span>
        </button>

        {showFiscal && (
          <div className="mt-3 p-4 rounded-xl bg-[#0f0f0f] border border-[#1f1f1f] space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Endereço" hint="Rua, número">
                <input
                  value={addrLine}
                  onChange={(e) => setAddrLine(e.target.value)}
                  placeholder="Rua Guadalajara, 1259"
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="Cidade">
                <input
                  value={addrCity}
                  onChange={(e) => setAddrCity(e.target.value)}
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="UF">
                <input
                  value={addrState}
                  onChange={(e) => setAddrState(e.target.value)}
                  placeholder="SP"
                  maxLength={2}
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="CEP">
                <input
                  value={addrZip}
                  onChange={(e) => setAddrZip(e.target.value)}
                  placeholder="00000-000"
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="Insc. Municipal">
                <input
                  value={municipalReg}
                  onChange={(e) => setMunicipalReg(e.target.value)}
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="Insc. Estadual">
                <input
                  value={stateReg}
                  onChange={(e) => setStateReg(e.target.value)}
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="Regime tributário" hint="Simples, MEI, Lucro…">
                <input
                  value={taxRegime}
                  onChange={(e) => setTaxRegime(e.target.value)}
                  placeholder="Ex: Simples Nacional"
                  className="w-full bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
              <Field label="Notas de faturamento" hint="Banco, PIX, condições">
                <input
                  value={billingNotes}
                  onChange={(e) => setBillingNotes(e.target.value)}
                  placeholder="PIX, conta, preferências…"
                  className="w-full md:col-span-2 bg-[#141414] border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg focus:border-[#D4A853] focus:outline-none"
                />
              </Field>
            </div>
          </div>
        )}
      </section>

      {/* Ações ─────────────────────────────────────────────────────── */}
      {toast && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          {toast}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1f1f1f]">
        <button
          type="button"
          onClick={onSkip}
          disabled={isPending}
          className="text-xs font-medium text-[#737373] hover:text-white transition-colors disabled:opacity-40"
        >
          Pular por agora
        </button>

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-wait text-[#0a0a0a] font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          {isPending ? 'Salvando…' : 'Continuar'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </form>
  )
}

// ─── Field wrapper (label + hint) ─────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-[#d4d4d4]">
        {label}
        {hint && <span className="text-[10px] text-[#525252] font-normal ml-1.5">· {hint}</span>}
      </span>
      {children}
    </label>
  )
}
