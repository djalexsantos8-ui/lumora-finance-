// ─── ClientFullForm · Formulário completo de ficha de cliente ───────────────
//
// Componente 100% controlado (sem state próprio). Reutilizado em:
//   · /clientes            — edição inline na listagem (nome EDITÁVEL)
//   · /freelances/[id]     — modo expandido do combobox (nome READ-ONLY,
//                             vem do próprio combobox logo acima)
//
// Layout copiado IDÊNTICO ao ClientRow original para evitar divergência visual.
// Quem chama é dono do save — este componente só coleta os campos.
//
// Props:
//   · value         — objeto com phone/instagram/email/document/notes
//   · onChange      — dispara a cada edição de qualquer campo
//   · disabled      — bloqueia todos os inputs (ex.: durante save)
//   · name          — valor do nome do cliente (obrigatório exibir)
//   · onNameChange  — se presente, nome é editável; se ausente + nameReadOnly
//                      true, nome vira "valor fixo" (estilo read-only).
//   · nameReadOnly  — explícito: true = não pode editar o nome aqui

'use client'

import { useState } from 'react'

export interface ClientFullFormValue {
  phone:     string
  instagram: string
  email:     string
  document:  string
  notes:     string
  // ── Expandidos (opcionais — aparecem só ao clicar "Mais detalhes") ──
  person_type:        '' | 'pf' | 'pj'
  legal_name:         string
  trade_name:         string
  document_cpf:       string
  document_cnpj:      string
  address_line:       string
  address_city:       string
  address_state:      string
  address_zip:        string
  segment:            string
  lead_source:        string
  payment_condition:  string
  responsible_name:   string
  responsible_role:   string
}

export const EMPTY_CLIENT_FULL_FORM: ClientFullFormValue = {
  phone:     '',
  instagram: '',
  email:     '',
  document:  '',
  notes:     '',
  person_type:       '',
  legal_name:        '',
  trade_name:        '',
  document_cpf:      '',
  document_cnpj:     '',
  address_line:      '',
  address_city:      '',
  address_state:     '',
  address_zip:       '',
  segment:           '',
  lead_source:       '',
  payment_condition: '',
  responsible_name:  '',
  responsible_role:  '',
}

interface Props {
  value:         ClientFullFormValue
  onChange:      (next: ClientFullFormValue) => void
  disabled?:     boolean
  name?:         string
  onNameChange?: (v: string) => void
  nameReadOnly?: boolean
}

export function ClientFullForm({
  value,
  onChange,
  disabled,
  name,
  onNameChange,
  nameReadOnly,
}: Props) {
  // Atalho pra atualizar 1 campo só — mantém imutabilidade do pai.
  const patch = (partial: Partial<ClientFullFormValue>) =>
    onChange({ ...value, ...partial })

  // Seção expandida — começa fechada para não poluir criação rápida.
  // Abre automaticamente se já existe algum dado expandido preenchido (ex: edição).
  const hasExpandedData =
    !!value.person_type ||
    !!value.legal_name ||
    !!value.trade_name ||
    !!value.document_cpf ||
    !!value.document_cnpj ||
    !!value.address_line ||
    !!value.address_city ||
    !!value.address_state ||
    !!value.address_zip ||
    !!value.segment ||
    !!value.lead_source ||
    !!value.payment_condition ||
    !!value.responsible_name ||
    !!value.responsible_role
  const [showMore, setShowMore] = useState<boolean>(hasExpandedData)

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
        {/* Nome — editável em /clientes, read-only dentro do freelance */}
        {nameReadOnly ? (
          <div>
            <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
              NOME <span className="text-[#D4A853]">*</span>
            </label>
            <div
              className="px-3 py-2 text-sm text-[#a3a3a3] bg-[#141414] border border-[#1f1f1f] rounded-xl truncate"
              title={name || undefined}
            >
              {name || <span className="text-[#525252]">—</span>}
            </div>
          </div>
        ) : (
          <Field
            label="Nome"
            value={name ?? ''}
            onChange={onNameChange ?? (() => {})}
            disabled={disabled}
            required
          />
        )}

        <Field
          label="Telefone"
          value={value.phone}
          onChange={(v) => patch({ phone: v })}
          disabled={disabled}
          placeholder="(11) 99999-9999"
        />
        <Field
          label="Instagram"
          value={value.instagram}
          onChange={(v) => patch({ instagram: v })}
          disabled={disabled}
          placeholder="@handle"
        />
        <Field
          label="Email"
          value={value.email}
          onChange={(v) => patch({ email: v })}
          disabled={disabled}
          placeholder="email@exemplo.com"
        />
        <Field
          label="Documento"
          value={value.document}
          onChange={(v) => patch({ document: v })}
          disabled={disabled}
          placeholder="CPF/CNPJ"
        />
      </div>

      <div className="mt-3">
        <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
          NOTAS
        </label>
        <textarea
          value={value.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          disabled={disabled}
          rows={2}
          placeholder="Referência interna, estilo de contrato, preferências…"
          className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors resize-none disabled:opacity-60"
        />
      </div>

      {/* ─── Mais detalhes (PJ, endereço, segmento, origem) ────────────────── */}
      {/* Colapsável pra não poluir cadastro rápido — só expande quem quer     */}
      {/* enriquecer a ficha para contratos, inteligência comercial, etc.     */}
      <div className="mt-4 pt-3 border-t border-[#1f1f1f]">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          disabled={disabled}
          className="text-[11px] font-semibold text-[#a3a3a3] hover:text-[#D4A853] tracking-wider uppercase flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          <span>{showMore ? '−' : '+'}</span>
          Mais detalhes {!showMore && <span className="text-[#525252] normal-case tracking-normal">(PJ · endereço · segmento · origem)</span>}
        </button>

        {showMore && (
          <div className="mt-3 space-y-3">
            {/* Tipo de pessoa — define o que aparece em documento */}
            <div>
              <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
                TIPO DE PESSOA
              </label>
              <div className="flex gap-2">
                {([
                  { v: '',   label: 'Não definido' },
                  { v: 'pf', label: 'Pessoa Física' },
                  { v: 'pj', label: 'Pessoa Jurídica' },
                ] as const).map((opt) => {
                  const active = value.person_type === opt.v
                  return (
                    <button
                      key={opt.v || 'none'}
                      type="button"
                      disabled={disabled}
                      onClick={() => patch({ person_type: opt.v })}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-60 ${
                        active
                          ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#E8C47A]'
                          : 'bg-[#1c1c1c] border-[#2a2a2a] text-[#a3a3a3] hover:border-[#3a3a3a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* PJ → razão social + nome fantasia + CNPJ */}
            {value.person_type === 'pj' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Razão Social"
                  value={value.legal_name}
                  onChange={(v) => patch({ legal_name: v })}
                  disabled={disabled}
                  placeholder="Empresa Ltda"
                />
                <Field
                  label="Nome Fantasia"
                  value={value.trade_name}
                  onChange={(v) => patch({ trade_name: v })}
                  disabled={disabled}
                  placeholder="Nome comercial"
                />
                <Field
                  label="CNPJ"
                  value={value.document_cnpj}
                  onChange={(v) => patch({ document_cnpj: v })}
                  disabled={disabled}
                  placeholder="00.000.000/0000-00"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Responsável"
                    value={value.responsible_name}
                    onChange={(v) => patch({ responsible_name: v })}
                    disabled={disabled}
                    placeholder="Nome do contato"
                  />
                  <Field
                    label="Cargo"
                    value={value.responsible_role}
                    onChange={(v) => patch({ responsible_role: v })}
                    disabled={disabled}
                    placeholder="Diretor, Marketing…"
                  />
                </div>
              </div>
            )}

            {/* PF → CPF */}
            {value.person_type === 'pf' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="CPF"
                  value={value.document_cpf}
                  onChange={(v) => patch({ document_cpf: v })}
                  disabled={disabled}
                  placeholder="000.000.000-00"
                />
              </div>
            )}

            {/* Endereço */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Endereço"
                value={value.address_line}
                onChange={(v) => patch({ address_line: v })}
                disabled={disabled}
                placeholder="Rua, número, complemento"
              />
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Cidade"
                  value={value.address_city}
                  onChange={(v) => patch({ address_city: v })}
                  disabled={disabled}
                />
                <Field
                  label="UF"
                  value={value.address_state}
                  onChange={(v) => patch({ address_state: v })}
                  disabled={disabled}
                  placeholder="SP"
                />
                <Field
                  label="CEP"
                  value={value.address_zip}
                  onChange={(v) => patch({ address_zip: v })}
                  disabled={disabled}
                  placeholder="00000-000"
                />
              </div>
            </div>

            {/* Inteligência comercial */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Segmento"
                value={value.segment}
                onChange={(v) => patch({ segment: v })}
                disabled={disabled}
                placeholder="Casamento, Institucional, Moda…"
              />
              <Field
                label="Origem do lead"
                value={value.lead_source}
                onChange={(v) => patch({ lead_source: v })}
                disabled={disabled}
                placeholder="Indicação, Instagram, Google…"
              />
            </div>

            {/* Condição de pagamento — observação livre */}
            <div>
              <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
                CONDIÇÃO DE PAGAMENTO <span className="text-[#525252] normal-case tracking-normal font-normal">(observação padrão)</span>
              </label>
              <textarea
                value={value.payment_condition}
                onChange={(e) => patch({ payment_condition: e.target.value })}
                disabled={disabled}
                rows={2}
                placeholder="Ex: 50% na assinatura + 50% na entrega · 30/60/90 dias · boleto"
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors resize-none disabled:opacity-60"
              />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Campo simples ───────────────────────────────────────────────────────────
// (cópia exata do <Field> original do ClientRow — mantido local do componente
// para não criar dependência externa e permitir que /clientes e freelances
// compartilhem 100% do layout.)

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  required?:    boolean
  disabled?:    boolean
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
        {label.toUpperCase()} {required && <span className="text-[#D4A853]">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
      />
    </div>
  )
}
