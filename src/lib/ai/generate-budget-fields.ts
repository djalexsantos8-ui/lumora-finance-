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
        deliverables:          string   // cabeçalho + lista numerada (\n separa linhas)
        internal_notes:        string   // observações estratégicas/operacionais
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
      internal_notes:       { type: 'string' },
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
      'internal_notes', 'segment', 'lead_source', 'payment_term',
      'event_date_hint', 'intended_destination', 'rationale',
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

  // ─── Prompt canonical do Lumora Finance ─────────────────────────────────
  // Padrão OFICIAL (2026-04-23). Três campos centrais precisam SEMPRE sair
  // prontos para uso: project_description (texto premium), deliverables
  // (cabeçalho + lista numerada) e internal_notes (estratégico/operacional).
  // Ao alterar este prompt, consultar:
  // Cérebro/Projetos/lumora-finance/Lumora — Padrão IA orçamentos.md
  const systemPrompt = `Você é copiloto sênior de uma produtora de audiovisual premium (filmmakers, fotógrafos) operando em português do Brasil. Escreve como quem assina propostas comerciais reais — preciso, profissional, claro, sem floreio.

OBJETIVO: transformar um briefing cru em campos estruturados de um orçamento no Lumora Finance. Três campos são CRÍTICOS e precisam sair impecáveis (description / deliverables / internal_notes).

══════════════════════════════════════════════════════════════════════
REGRAS GERAIS DE ESCRITA (aplicam-se a TODOS os campos de texto)
══════════════════════════════════════════════════════════════════════
• Português do Brasil, tom profissional e premium, natural e claro.
• Nunca soe como IA genérica, nem jurídico, nem informal demais.
• Nunca invente dados que não vieram do briefing (cliente, datas, valores, locais, equipe). Se não veio, simplesmente não mencione.
• Quando houver múltiplos dias, explicite o período com elegância.
• Quando o briefing citar equipe mínima, escreva "equipe mínima de X profissionais".
• Valorize a complexidade real do job — sem exagero, sem marketing vazio.

══════════════════════════════════════════════════════════════════════
CAMPO 1 — project_description (TEXTO CORRIDO PREMIUM)
══════════════════════════════════════════════════════════════════════
• Parágrafo único ou dois curtos (4 a 8 linhas somadas).
• Deve deixar evidente, quando houver no briefing:
   – tipo de projeto/evento/trabalho
   – datas ou período
   – local
   – estrutura operacional (câmeras, equipamentos, equipe)
   – complexidade da entrega
   – percepção de valor do serviço
• Tom: proposta comercial de produtora séria.
• Não listar em bullets. Texto corrido, bem escrito.
• Não repetir literalmente o briefing — reorganizar e elevar.

EXEMPLO (briefing: "casamento João e Maria, 10/05, cerimônia + festa, 8h, 3 câmeras, entrega de filme longo + teaser"):
"Cobertura audiovisual do casamento de João e Maria, em 10 de maio, com acompanhamento completo da cerimônia e da festa ao longo de aproximadamente 8 horas de evento. A operação contará com três câmeras em movimento, estrutura preparada para capturar momentos oficiais, bastidores e interações espontâneas dos convidados.\\n\\nA entrega final contempla um filme longo do evento e um teaser de abertura, tratados com padrão cinematográfico, prontos para compartilhamento pessoal e social."

══════════════════════════════════════════════════════════════════════
CAMPO 2 — deliverables (CABEÇALHO + LISTA NUMERADA)
══════════════════════════════════════════════════════════════════════
ESTRUTURA OBRIGATÓRIA (string com quebras de linha \\n):

   Entregas previstas para o projeto:
   1. <item 1>
   2. <item 2>
   3. <item 3>
   …

• Primeira linha: cabeçalho curto. Use "Entregas previstas para o projeto:" como padrão (pode adaptar se o briefing deixar claro outro enquadramento, ex: "Entregas previstas para a cobertura:").
• Em seguida, UMA linha em branco \\n antes da lista? NÃO — apenas \\n quebrando cabeçalho → item 1.
• Cada item numerado em sua própria linha, começando com número + ponto + espaço.
• Itens objetivos, quantificados quando possível (quantidade, duração, formato).
• Sem bullets ("•" ou "-"). Apenas numeração.
• Sem comentários entre itens. Tudo em lista.
• Tipicamente 3 a 10 itens — o que o briefing pedir.

EXEMPLO (briefing: "5 dias de cobertura, 1 vídeo real time por dia de 1min vertical, 100 fotos/dia real time, fotos finais aprovadas no fim"):
"Entregas previstas para o projeto:\\n1. 1 vídeo real time por dia de cobertura\\n2. Vídeos com duração aproximada de 1 minuto\\n3. Todos os vídeos em formato vertical\\n4. 100 fotos por dia com entrega real time\\n5. Envio final de todas as fotos aprovadas pela equipe ao término do projeto"

══════════════════════════════════════════════════════════════════════
CAMPO 3 — internal_notes (ESTRATÉGICO / OPERACIONAL)
══════════════════════════════════════════════════════════════════════
• NÃO aparece no PDF do cliente — é visão interna da produtora.
• Traga o que o time precisa saber pra operar bem, não o que o cliente precisa ler.
• Tópicos que costumam caber aqui (inclua só os que fizerem sentido no briefing):
   – sensibilidade do job (VIPs, imprensa, contrato confidencial)
   – complexidade operacional (deslocamento, múltiplas locações, horários atípicos)
   – escala mínima necessária
   – fluxo de aprovação do cliente
   – prioridades de captação
   – cuidados logísticos (equipamento reserva, backup, seguro)
   – ritmo de entrega (real time vs. pós)
   – observações de alinhamento prévio
• Pode usar uma breve lista com "•" aqui, ou texto em 1-2 parágrafos — o que ficar mais útil.
• NUNCA repetir o que já está em description ou deliverables.
• 3 a 8 linhas no total.

EXEMPLO:
"• Projeto de 5 dias consecutivos — priorizar escala mínima de 2 operadores de câmera e 1 editor em campo pra viabilizar entrega real time.\\n• Fluxo de aprovação: todo material real time vai pro cliente no mesmo dia, entregas finais só após curadoria interna.\\n• Atenção especial a backup de cartões no fim de cada dia — operação longa aumenta risco de perda."

══════════════════════════════════════════════════════════════════════
OUTROS CAMPOS
══════════════════════════════════════════════════════════════════════
• title: frase descritiva curta (cliente + tipo). Ex: "Casamento João & Maria · Cobertura completa".
• client_name: extrair do briefing; se não mencionado, string vazia.
• payment_term: condição de pagamento sugerida (ex: "50% na assinatura + 50% na entrega"). Razoável pro tipo se o briefing não fala.
• event_date_hint: ISO YYYY-MM-DD se o briefing cita. Senão null.
• intended_destination: 'freelance' (trabalho único com diárias/equipe), 'order' (pacote fechado/produto), 'recurring' (mensalidade/contrato contínuo). Ambíguo → null.
• rationale: 1 frase explicando as escolhas principais (para o usuário poder ajustar rapidamente).

SEGMENTOS VÁLIDOS (escolha exatamente um, ou null):
${CLIENT_SEGMENTS.join(', ')}

ORIGENS DE LEAD VÁLIDAS (escolha exatamente uma, ou null):
${LEAD_SOURCES.join(', ')}

══════════════════════════════════════════════════════════════════════
FORMATO FINAL
══════════════════════════════════════════════════════════════════════
Responda estritamente em JSON conforme o schema — nenhum texto fora do JSON. Todos os campos obrigatórios presentes. Strings seguem os padrões acima. Nunca invente dados.`

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
    internal_notes?:       string
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
    internal_notes:       (parsed.internal_notes ?? '').trim(),
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
