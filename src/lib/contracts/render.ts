// ─── Renderer de contratos ───────────────────────────────────────────────────
//
// Recebe um ContractContext (tipo + valores resolvidos) e devolve markdown
// pronto. Placeholders sem valor ficam sinalizados (para o Builder destacar
// o que falta sem deixar {{placeholder}} cru no documento final).

import type {
  ContractType,
  ContractContext,
  RenderedContract,
} from '@/types/contract'
import { getContractMeta } from './catalog'
import { TEMPLATES } from './templates'

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g

// Usado quando o valor não existe — marcado em itálico para o contrato
// não ficar "sujo" com {{…}} no texto final. Usuário vê claramente o que falta.
function placeholderSignal(key: string): string {
  return `_[${key} pendente]_`
}

export function renderContract(ctx: ContractContext): RenderedContract {
  const template = TEMPLATES[ctx.contractType]
  if (!template) {
    return {
      markdown: '',
      missing: [],
      unresolved: [],
    }
  }

  const unresolved: string[] = []

  const markdown = template.replace(PLACEHOLDER_RE, (_, key: string) => {
    const val = ctx.values[key]
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val)
    }
    unresolved.push(key)
    return placeholderSignal(key)
  })

  return {
    markdown,
    missing: [...new Set(ctx.missing)],
    unresolved: [...new Set(unresolved)],
  }
}

// ─── Validação: todos os "required" estão preenchidos? ─────────────────────

export function canGenerate(
  type: ContractType,
  values: Record<string, string | null | undefined>
): { ok: boolean; missingRequired: string[] } {
  const meta = getContractMeta(type)
  const missingRequired = meta.required.filter(k => {
    const v = values[k]
    return v === undefined || v === null || String(v).trim() === ''
  })
  return { ok: missingRequired.length === 0, missingRequired }
}
