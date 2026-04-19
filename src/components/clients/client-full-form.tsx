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

export interface ClientFullFormValue {
  phone:     string
  instagram: string
  email:     string
  document:  string
  notes:     string
}

export const EMPTY_CLIENT_FULL_FORM: ClientFullFormValue = {
  phone:     '',
  instagram: '',
  email:     '',
  document:  '',
  notes:     '',
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
