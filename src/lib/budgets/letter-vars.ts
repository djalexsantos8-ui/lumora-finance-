/**
 * EPIC-17 — Substituição de variáveis na carta de orçamento.
 *
 * Variáveis suportadas (todas opcionais, fallback = string vazia ou literal):
 *   {{cliente_nome}}    → nome do cliente vinculado
 *   {{projeto_nome}}    → budget.name
 *   {{validade}}        → "DD/MMM" calculado de created_at + validity_days
 *   {{prazo_entrega}}   → budget.delivery_days + " dias após aprovação"
 *   {{produtora_nome}}  → workspace.name
 *   {{numero}}          → budget.number (ORC-2026-NNN)
 *
 * Variável desconhecida fica literal no output (ex: {{xpto}}) — facilita debug.
 */

export interface LetterVars {
  cliente_nome?:    string | null
  projeto_nome?:    string | null
  validade?:        string | null
  prazo_entrega?:   string | null
  produtora_nome?:  string | null
  numero?:          string | null
}

const VAR_PATTERN = /\{\{(\w+)\}\}/g

export function substituteLetterVars(text: string, vars: LetterVars): string {
  if (!text) return ''
  return text.replace(VAR_PATTERN, (match, key: string) => {
    const v = (vars as Record<string, string | null | undefined>)[key]
    if (v === undefined) return match // mantém literal se variável não existe
    return v ?? ''
  })
}

/** Lista de variáveis pra UI (chips clicáveis). */
export const AVAILABLE_VARS: { code: string; label: string }[] = [
  { code: '{{cliente_nome}}',   label: 'Nome do cliente' },
  { code: '{{projeto_nome}}',   label: 'Nome do projeto' },
  { code: '{{validade}}',       label: 'Validade do orçamento' },
  { code: '{{prazo_entrega}}',  label: 'Prazo de entrega' },
  { code: '{{produtora_nome}}', label: 'Nome da produtora' },
  { code: '{{numero}}',         label: 'Número (ORC-YYYY-NNN)' },
]

/** Carta padrão pra primeiro orçamento — tom Lumora. */
export const DEFAULT_LETTER_MD = `## Apresentação

Olá {{cliente_nome}}! Que prazer ver seu projeto {{projeto_nome}}. Preparamos esse orçamento com cuidado pra refletir o trabalho que vamos entregar.

## Sobre o projeto

Esse orçamento contempla todas as etapas da produção, do planejamento à entrega final. Cada item foi pensado pra garantir qualidade técnica e criativa no resultado.

## Condições

A validade desse orçamento é até {{validade}}. O prazo de entrega é {{prazo_entrega}} a partir da aprovação. Qualquer ajuste de escopo a gente conversa antes — sem surpresa no final.
`
