// ─── ClientPicker · Padrão ÚNICO de captura de cliente no sistema ────────────
//
// Composição de alto nível que encapsula:
//   · ClientCombobox    (autocomplete de nome)
//   · Botão toggle      "+ Adicionar detalhes" / "− Recolher"
//   · Mensagem de UX    (explicando modo rápido vs completo)
//   · ClientFullForm    (modo expandido — phone/ig/email/doc/notes)
//   · Reset automático  quando o nome diverge do ancoragem do registro pai
//
// Regras do padrão (enforçadas por construção):
//   1. Sempre autocomplete + criação rápida
//   2. Nome = source of truth. Form renderiza nome em read-only.
//   3. Extras NÃO vazam entre clientes: useEffect observa `resetAnchor`
//   4. Save encadeado é responsabilidade do caller (depende da action dele)
//
// USAR EM:
//   · /freelances/[id]     ← (pode adotar numa refatoração futura; hoje usa
//                             composição manual — comportamento equivalente)
//   · /budgets/[id]        ← primeiro consumidor deste componente
//   · /contracts           ← futuro
//   · /receitas-recorrentes← futuro
//
// NÃO USAR <input> texto livre pra cliente em nenhuma tela nova.

'use client'

import { useEffect } from 'react'
import { ClientCombobox } from './client-combobox'
import {
  ClientFullForm,
  EMPTY_CLIENT_FULL_FORM,
  type ClientFullFormValue,
} from './client-full-form'

interface Props {
  /** Nome atual do cliente (source of truth). */
  name:            string
  onNameChange:    (v: string) => void

  /** Extras (phone/ig/email/doc/notes) — controlados pelo pai. */
  extras:          ClientFullFormValue
  onExtrasChange:  (v: ClientFullFormValue) => void

  /** Modo expandido (ficha completa) — controlado pelo pai. */
  expanded:        boolean
  onExpandedChange: (v: boolean) => void

  /**
   * Valor "âncora" do registro pai (ex.: budget.client_name, job.client_name).
   * Quando `name` diverge de `resetAnchor`, os extras são zerados e o modo
   * expandido é recolhido. Isso garante que o padrão não mistura dados
   * entre clientes. Se não passar, o reset nunca acontece.
   */
  resetAnchor?:    string

  /** Helper text acima das ações (default: mensagem padrão). */
  hint?:           string

  disabled?:       boolean
  autoFocus?:      boolean
  /** Nome do field HTML (default: 'client_name'). */
  fieldName?:      string
  placeholder?:    string
}

const DEFAULT_HINT =
  'Selecione um cliente existente ou digite um nome novo — ele será criado ao salvar.'

const EXPANDED_MESSAGE =
  'Você pode cadastrar apenas o nome para criar rapidamente o cliente. ' +
  'Ou adicionar mais detalhes agora para manter seu cadastro organizado.'

export function ClientPicker({
  name,
  onNameChange,
  extras,
  onExtrasChange,
  expanded,
  onExpandedChange,
  resetAnchor,
  hint = DEFAULT_HINT,
  disabled,
  autoFocus,
  fieldName = 'client_name',
  placeholder = 'Nome do cliente',
}: Props) {

  // Reset crítico (invariante do padrão): se o usuário muda o cliente,
  // os extras do anterior não podem vazar. Comparar com o âncora do
  // registro pai — não com o próprio `name` anterior (senão ficaria
  // acoplado ao ciclo de digitação).
  useEffect(() => {
    if (resetAnchor === undefined) return
    if (name !== resetAnchor) {
      onExtrasChange(EMPTY_CLIENT_FULL_FORM)
      onExpandedChange(false)
    }
    // Callbacks são estáveis (useState setters) mas vão como dep mesmo
    // assim pra satisfazer eslint em projetos mais rígidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, resetAnchor])

  const canExpand = !!name.trim()

  return (
    <div className="flex flex-col gap-2">
      <ClientCombobox
        name={fieldName}
        defaultValue={name}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={onNameChange}
        onSelectExisting={(c) => onNameChange(c.name)}
      />

      {hint && <p className="text-[10px] text-[#525252]">{hint}</p>}

      {/* Toggle em LINHA PRÓPRIA — nunca na mesma linha da ação principal.
          O botão "Salvar/Cancelar" é renderizado pelo pai (depende da action).

          BP2 (not-allowed vs wait, docs/lumora-aprendizados-…): o disabled
          aqui é por ESTADO INVÁLIDO (nome vazio), não por operação pendente,
          então not-allowed é semanticamente correto. Adicionamos `title` e
          `aria-label` pra explicar o motivo — evita o antipadrão do "botão
          cinza sem razão visível". */}
      <div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onExpandedChange(!expanded)}
          disabled={disabled || !canExpand}
          title={!canExpand && !disabled ? 'Digite o nome do cliente primeiro' : undefined}
          aria-label={
            !canExpand && !disabled
              ? '+ Adicionar detalhes — digite o nome do cliente primeiro'
              : undefined
          }
          className="text-[11px] font-medium text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {expanded ? '− Recolher' : '+ Adicionar detalhes'}
        </button>
      </div>

      {expanded && (
        <div className="mt-1 p-3 rounded-xl bg-[#101010] border border-[#1f1f1f]">
          <p className="text-xs text-[#737373] leading-relaxed">
            {EXPANDED_MESSAGE}
          </p>
          <ClientFullForm
            name={name}
            nameReadOnly
            value={extras}
            onChange={onExtrasChange}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}
