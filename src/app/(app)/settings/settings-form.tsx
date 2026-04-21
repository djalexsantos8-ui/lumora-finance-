'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { upsertWorkspaceSettings } from '@/lib/actions/workspace-settings'
import type { WorkspaceSettings } from '@/types/workspace-settings'

// ─── Settings — seções (pente fino 2026-04-21) ───────────────────────────────
// Ao invés de um form gigante vertical, dividimos em seções navegáveis:
//   · Identidade  (logo + nome da marca)
//   · Empresa     (dados que saem nos documentos: assinatura, rodapé)
//   · Notificações (placeholder V1 — só aviso do que vem aí)

type SectionId = 'identity' | 'company' | 'notifications'

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

          {/* ─── Empresa (assinatura/rodapé) ─────────────────────────────── */}
          {section === 'company' && (
            <>
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
          {section !== 'notifications' && (
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
