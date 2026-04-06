'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { upsertWorkspaceSettings } from '@/lib/actions/workspace-settings'
import type { WorkspaceSettings } from '@/types/workspace-settings'

interface Props {
  settings:    WorkspaceSettings | null
  workspaceId: string
}

export default function SettingsForm({ settings, workspaceId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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

    // Preview local imediato
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
      setLogoPreview(logoUrl) // reverte preview
      setUploadingLogo(false)
      return
    }

    // Gera URL pública com cache-bust
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
    // Garante que o logoUrl atual vai no formData
    formData.set('company_logo_url', logoUrl)

    startTransition(async () => {
      const result = await upsertWorkspaceSettings(formData)
      if (result.success) {
        setToast({ type: 'success', message: 'Configurações salvas com sucesso!' })
        setTimeout(() => setToast(null), 4000)
      } else {
        setToast({ type: 'error', message: result.error })
      }
    })
  }

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Logo */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Logotipo</h2>

        <div className="flex items-start gap-4">
          {/* Preview */}
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

          {/* Actions */}
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

      {/* Identidade */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Identidade</h2>

        <div>
          <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
            Nome da empresa / marca
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

      {/* Assinatura */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Assinatura nos documentos</h2>

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

      {/* Submit */}
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
    </form>
  )
}

const inputCls =
  'w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 ' +
  'focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
