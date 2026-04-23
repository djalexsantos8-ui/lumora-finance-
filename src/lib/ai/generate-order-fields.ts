'use server'

/**
 * src/lib/ai/generate-order-fields.ts
 *
 * Server action "Gerar com IA" para Pedidos.
 *
 * Entrada: briefing livre ("pacote de fotos institucional Tech Corp,
 * entrega em 15 dias, pagamento em 30d, 300 fotos").
 *
 * Saída estruturada (JSON strict):
 *   {
 *     title, client_name, project_description, deliverables,
 *     client_segment, lead_source, payment_condition,
 *     event_date_hint, delivery_date_hint,
 *     rationale
 *   }
 *
 * Mesma lógica de quota do generateBudgetFields: 1 chamada = 1 crédito.
 * O caller (order-editor) aplica no form e o usuário revisa antes do save.
 */

import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { consumeAICredit, type AIQuota } from '@/lib/ai/quota'
import { openaiChat, isOpenAIEnabled } from '@/lib/ai/openai'
import { CLIENT_SEGMENTS } from '@/lib/canonical/segments'
import { LEAD_SOURCES }    from '@/lib/canonical/lead-sources'

export type GenerateOrderFieldsResult =
  | {
      success: true
      fields: {
        title:               string
        client_name:         string
        project_description: string
        deliverables:        string
        client_segment:      string | null
        lead_source:         string | null
        payment_condition:   string | null
        event_date_hint:     string | null
        delivery_date_hint:  string | null
        rationale:           string
      }
      quota: AIQuota
    }
  | {
      success: false
      message: string
      reason?: 'not_authenticated' | 'no_workspace' | 'ai_disabled' | 'limit_exceeded' | 'openai_error' | 'parse_error' | 'empty_brief'
      quota?:  AIQuota | null
    }

const ORDER_JSON_SCHEMA = {
  name: 'order_fields',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title:               { type: 'string' },
      client_name:         { type: 'string' },
      project_description: { type: 'string' },
      deliverables:        { type: 'string' },
      client_segment:      { type: ['string', 'null'] },
      lead_source:         { type: ['string', 'null'] },
      payment_condition:   { type: ['string', 'null'] },
      event_date_hint:     { type: ['string', 'null'] },
      delivery_date_hint:  { type: ['string', 'null'] },
      rationale:           { type: 'string' },
    },
    required: [
      'title', 'client_name', 'project_description', 'deliverables',
      'client_segment', 'lead_source', 'payment_condition',
      'event_date_hint', 'delivery_date_hint', 'rationale',
    ],
  },
}

export async function generateOrderFields(
  brief: string
): Promise<GenerateOrderFieldsResult> {
  const trimmed = (brief || '').trim()
  if (trimmed.length < 10) {
    return {
      success: false,
      message: 'Descreva um pouco mais o pedido (mínimo ~10 caracteres).',
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

  const systemPrompt = `Você é um copiloto de Pedidos (pacotes fechados / produtos) para estúdios audiovisuais. Gere campos estruturados em português-BR.

Regras:
1. title: nome curto do pedido com cliente/produto.
2. client_name: extrair do briefing; se não mencionado, deixar string vazia.
3. project_description: 2-4 linhas sobre o que é o pedido.
4. deliverables: 1 linha com o que vai ser entregue (ex: "300 fotos editadas + álbum digital").
5. client_segment: um item EXATO da lista abaixo, ou null.
6. lead_source: um item EXATO da lista abaixo, ou null.
7. payment_condition: condição de pagamento. Ex: "30 dias", "À vista", "50% + 50%". Null se ambíguo.
8. event_date_hint: YYYY-MM-DD se briefing menciona data do evento/shoot, senão null.
9. delivery_date_hint: YYYY-MM-DD da data de entrega estimada, senão null.
10. rationale: 1 frase explicando as escolhas pro usuário revisar.

NUNCA invente cliente, datas, preços. Se não sabe, deixe null/vazio.

SEGMENTOS VÁLIDOS (use exatamente um ou null):
${CLIENT_SEGMENTS.join(', ')}

ORIGENS DE LEAD VÁLIDAS (use exatamente uma ou null):
${LEAD_SOURCES.join(', ')}`

  const userPrompt = `Briefing do pedido:

"""
${trimmed.slice(0, 4000)}
"""

Gere os campos estruturados.`

  let content: string
  try {
    content = await openaiChat({
      systemPrompt,
      userPrompt,
      jsonSchema:  ORDER_JSON_SCHEMA,
      temperature: 0.3,
      maxRetries:  2,
    })
  } catch (err) {
    console.error('[ai/generate-order-fields] openai', err)
    return {
      success: false,
      message: 'Erro ao gerar com IA. Tente de novo em instantes.',
      reason:  'openai_error',
      quota:   consume.quota,
    }
  }

  let parsed: {
    title?:               string
    client_name?:         string
    project_description?: string
    deliverables?:        string
    client_segment?:      string | null
    lead_source?:         string | null
    payment_condition?:   string | null
    event_date_hint?:     string | null
    delivery_date_hint?:  string | null
    rationale?:           string
  }
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    console.error('[ai/generate-order-fields] parse', err, content.slice(0, 300))
    return {
      success: false,
      message: 'Resposta da IA não pôde ser interpretada. Tente novamente.',
      reason:  'parse_error',
      quota:   consume.quota,
    }
  }

  const fields: (GenerateOrderFieldsResult & { success: true })['fields'] = {
    title:               (parsed.title ?? '').trim(),
    client_name:         (parsed.client_name ?? '').trim(),
    project_description: (parsed.project_description ?? '').trim(),
    deliverables:        (parsed.deliverables ?? '').trim(),
    client_segment:      parsed.client_segment ? parsed.client_segment.trim() || null : null,
    lead_source:         parsed.lead_source ? parsed.lead_source.trim() || null : null,
    payment_condition:   parsed.payment_condition ? parsed.payment_condition.trim() || null : null,
    event_date_hint:     sanitizeDate(parsed.event_date_hint ?? null),
    delivery_date_hint:  sanitizeDate(parsed.delivery_date_hint ?? null),
    rationale:           (parsed.rationale ?? '').trim(),
  }

  return {
    success: true,
    fields,
    quota:   consume.quota,
  }
}

function sanitizeDate(v: string | null): string | null {
  if (!v) return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return v.trim()
}
