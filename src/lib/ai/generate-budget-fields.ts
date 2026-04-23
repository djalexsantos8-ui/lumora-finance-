'use server'

/**
 * src/lib/ai/generate-budget-fields.ts
 *
 * Server action "Gerar com IA" para orçamentos.
 *
 * Entrada: briefing livre do usuário (texto curto/médio).
 *   ex: "orçamento pra casamento do Joao e Maria, 6h de cobertura,
 *        1 teaser + filme longo, entrega em 45 dias, 3 câmeras"
 *
 * Saída estruturada (JSON strict):
 *   {
 *     title:               string
 *     client_name:         string  (melhor palpite ou '')
 *     project_description: string
 *     deliverables:        string
 *     segment:             string | null  (da lista canonical)
 *     lead_source:         string | null  (da lista canonical)
 *     payment_term:        string | null
 *     event_date_hint:     string | null  (YYYY-MM-DD ou null)
 *     intended_destination: 'freelance' | 'order' | 'recurring' | null
 *     rationale:           string  (porquê o modelo sugeriu isso)
 *   }
 *
 * O caller (budget-editor) aplica os valores nos inputs e dispara o auto-save.
 * Nada é gravado direto — o usuário vê o preenchimento antes de confirmar.
 *
 * Quota: 1 geração = 1 crédito. Se estourou o limite do workspace no mês,
 * retorna { success: false, reason: 'limit_exceeded', quota }.
 */

import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { consumeAICredit, type AIQuota } from '@/lib/ai/quota'
import { openaiChat, isOpenAIEnabled } from '@/lib/ai/openai'
import { CLIENT_SEGMENTS } from '@/lib/canonical/segments'
import { LEAD_SOURCES }    from '@/lib/canonical/lead-sources'

export type GenerateBudgetFieldsResult =
  | {
      success: true
      fields: {
        title:                 string
        client_name:           string
        project_description:   string
        deliverables:          string
        segment:               string | null
        lead_source:           string | null
        payment_term:          string | null
        event_date_hint:       string | null
        intended_destination:  'freelance' | 'order' | 'recurring' | null
        rationale:             string
      }
      quota: AIQuota
    }
  | {
      success: false
      message: string
      reason?: 'not_authenticated' | 'no_workspace' | 'ai_disabled' | 'limit_exceeded' | 'openai_error' | 'parse_error' | 'empty_brief'
      quota?:  AIQuota | null
    }

const BUDGET_JSON_SCHEMA = {
  name: 'budget_fields',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title:                { type: 'string' },
      client_name:          { type: 'string' },
      project_description:  { type: 'string' },
      deliverables:         { type: 'string' },
      segment:              { type: ['string', 'null'] },
      lead_source:          { type: ['string', 'null'] },
      payment_term:         { type: ['string', 'null'] },
      event_date_hint:      { type: ['string', 'null'] },
      intended_destination: {
        type: ['string', 'null'],
        enum: ['freelance', 'order', 'recurring', null],
      },
      rationale:            { type: 'string' },
    },
    required: [
      'title', 'client_name', 'project_description', 'deliverables',
      'segment', 'lead_source', 'payment_term', 'event_date_hint',
      'intended_destination', 'rationale',
    ],
  },
}

export async function generateBudgetFields(
  brief: string
): Promise<GenerateBudgetFieldsResult> {
  const trimmed = (brief || '').trim()
  if (trimmed.length < 10) {
    return {
      success: false,
      message: 'Descreva um pouco mais o orçamento (mínimo ~10 caracteres).',
      reason:  'empty_brief',
    }
  }

  if (!isOpenAIEnabled()) {
    return {
      success: false,
      message: 'IA indisponível no momento. Tente preencher manualmente.',
      reason:  'ai_disabled',
    }
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { success: false, message: 'Não autenticado.', reason: 'not_authenticated' }
  }
  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) {
    return { success: false, message: 'Workspace não encontrado.', reason: 'no_workspace' }
  }

  // Quota PRIMEIRO — não gasta chamada da OpenAI se já estourou.
  const consume = await consumeAICredit(supabase, workspaceId)
  if (!consume.ok) {
    if (consume.reason === 'limit_exceeded') {
      return {
        success: false,
        message: 'Limite mensal de gerações por IA atingido.',
        reason:  'limit_exceeded',
        quota:   consume.quota,
      }
    }
    return {
      success: false,
      message: 'Erro de quota. Tente de novo em instantes.',
      reason:  'openai_error',
      quota:   consume.quota,
    }
  }

  // Prompt — portugês-br, aterrado no canon de segmentos/lead sources
  // pra o modelo usar valores que vão casar com o TagCombobox.
  const systemPrompt = `Você é um copiloto especialista em orçamentos de audiovisual (filmmakers, fotógrafos, produtoras) operando em português-BR.

Transforme o briefing em campos estruturados de um orçamento no Lumora Finance. Regras:

1. Use sempre português brasileiro, tom profissional e curto.
2. title: frase descritiva com cliente ou tipo de projeto (ex: "Casamento João & Maria · Cobertura completa").
3. client_name: extrair do briefing; se não mencionado, deixar string vazia.
4. project_description: 1 parágrafo (2-4 linhas) explicando o projeto.
5. deliverables: LISTA em uma linha (bullet-less) com o que será entregue. Ex: "Vídeo highlight 5min, 200 fotos editadas, teaser 60s".
6. segment: escolher o ITEM MAIS PRÓXIMO da lista abaixo. Se nenhum bate, null.
7. lead_source: escolher o ITEM MAIS PRÓXIMO da lista abaixo (se mencionado no briefing). Se nenhum bate, null.
8. payment_term: condição de pagamento sugerida. Ex: "50% na assinatura + 50% na entrega", "30 dias", "À vista". Se o briefing não dá pista, sugerir algo razoável pro tipo.
9. event_date_hint: data ISO YYYY-MM-DD se o briefing menciona. Senão null.
10. intended_destination: 'freelance' (trabalho único com diárias/equipe), 'order' (pacote fechado/produto), 'recurring' (mensalidade/contrato contínuo). Se ambíguo, null.
11. rationale: 1 frase explicando as escolhas principais (para o usuário poder ajustar).

NUNCA INVENTE cliente, datas, preços. Se não sabe, deixe null/vazio.

SEGMENTOS VÁLIDOS (use exatamente um deles ou null):
${CLIENT_SEGMENTS.join(', ')}

ORIGENS DE LEAD VÁLIDAS (use exatamente uma delas ou null):
${LEAD_SOURCES.join(', ')}`

  const userPrompt = `Briefing do orçamento:

"""
${trimmed.slice(0, 4000)}
"""

Gere os campos estruturados.`

  let content: string
  try {
    content = await openaiChat({
      systemPrompt,
      userPrompt,
      jsonSchema:  BUDGET_JSON_SCHEMA,
      temperature: 0.3,
      maxRetries:  2,
    })
  } catch (err) {
    console.error('[ai/generate-budget-fields] openai', err)
    return {
      success: false,
      message: 'Erro ao gerar com IA. Tente de novo em instantes.',
      reason:  'openai_error',
      quota:   consume.quota,
    }
  }

  let parsed: {
    title?:                string
    client_name?:          string
    project_description?:  string
    deliverables?:         string
    segment?:              string | null
    lead_source?:          string | null
    payment_term?:         string | null
    event_date_hint?:      string | null
    intended_destination?: 'freelance' | 'order' | 'recurring' | null
    rationale?:            string
  }
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    console.error('[ai/generate-budget-fields] parse', err, content.slice(0, 300))
    return {
      success: false,
      message: 'Resposta da IA não pôde ser interpretada. Tente novamente.',
      reason:  'parse_error',
      quota:   consume.quota,
    }
  }

  // Normalização defensiva: garantir strings seguras e enum válido.
  const fields: (GenerateBudgetFieldsResult & { success: true })['fields'] = {
    title:                (parsed.title ?? '').trim(),
    client_name:          (parsed.client_name ?? '').trim(),
    project_description:  (parsed.project_description ?? '').trim(),
    deliverables:         (parsed.deliverables ?? '').trim(),
    segment:              parsed.segment ? parsed.segment.trim() || null : null,
    lead_source:          parsed.lead_source ? parsed.lead_source.trim() || null : null,
    payment_term:         parsed.payment_term ? parsed.payment_term.trim() || null : null,
    event_date_hint:      sanitizeDate(parsed.event_date_hint ?? null),
    intended_destination: parsed.intended_destination === 'freelance'
      || parsed.intended_destination === 'order'
      || parsed.intended_destination === 'recurring'
        ? parsed.intended_destination
        : null,
    rationale:            (parsed.rationale ?? '').trim(),
  }

  return {
    success: true,
    fields,
    quota:   consume.quota,
  }
}

function sanitizeDate(v: string | null): string | null {
  if (!v) return null
  // Espera YYYY-MM-DD. Tolera espaços.
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return v.trim()
}
