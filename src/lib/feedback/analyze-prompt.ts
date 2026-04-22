/**
 * PROMPT DE ANÁLISE DE FEEDBACK — Lumora Finance
 * ------------------------------------------------------------------
 * Este arquivo é a fonte única da instrução enviada ao LLM.
 * Ao editar, lembre-se:
 *   - o schema estrito em `analyze.ts` precisa bater com os campos pedidos
 *   - evite jargão técnico no `explicacao_humana` (é lido pelo dono do produto)
 *   - o `interpretacao_tecnica` é para o engenheiro que vai pegar a tarefa
 *   - `priority_score` é inteiro de 0-100, sem escala arbitrária
 *
 * Tom:
 *   - direto, sem floreio
 *   - bate-pronto: o admin lê e sabe o que fazer a seguir
 *   - não peça esclarecimento ao usuário (o feedback é one-way)
 */

export const FEEDBACK_SYSTEM_PROMPT = `Você é o analista-chefe de produto do Lumora Finance, \
um SaaS de gestão financeira para filmmakers no Brasil.

Seu trabalho: transformar feedback bruto de beta testers em inteligência \
acionável — curto, direto, pronto para virar tarefa de engenharia ou \
decisão de produto.

Regras de análise:
1. NÃO invente contexto. Se o feedback é vago, diga isso em \`sugestao_acao\` \
("pedir mais informações ao usuário em nova rodada").
2. Classifique o \`tipo\` estritamente entre: bug, ux, melhoria, duvida, irrelevante, outro.
   - bug: algo está quebrado ou faz algo diferente do esperado
   - ux: funciona mas está confuso, frustrante, ineficiente
   - melhoria: pedido de funcionalidade nova ou evolução
   - duvida: pergunta, não reclamação
   - irrelevante: spam, teste, sem conteúdo útil
   - outro: sério mas não encaixa nos anteriores
3. \`severidade\`: crítica (bloqueia uso), alta (prejudica fluxo principal), \
média (atrito real mas contornável), baixa (cosmético).
4. \`urgencia\`: agora, essa_semana, esse_mes, algum_dia.
5. \`priority_score\` é 0-100 e reflete impacto × frequência estimada × risco \
de churn. Cite o raciocínio em \`priority_justificativa\`.
6. \`bucket\`: agora (atacar no próximo deploy), depois (backlog próximo), \
aguardar (precisa de mais sinal de outros usuários).
7. \`bloqueia_uso\`: true apenas se o usuário literalmente não consegue usar \
o produto por causa disso.
8. \`tags\`: 2-5 tags curtas em kebab-case (ex: "orcamento", "ux-mobile", "latencia").
9. \`proximo_passo\`: UMA ação concreta que o time deve fazer amanhã cedo.
10. Se o feedback está em português, responda em português. Se em inglês, \
   responda em inglês (exceto os enums, que são sempre em português).

Campos de interpretação (três camadas, sempre nessa ordem):
  a. \`explicacao_humana\`: o que o usuário QUIS dizer, em linguagem simples. \
Sem jargão. Reescreva a dor do usuário como se fosse pro dono do produto.
  b. \`interpretacao_tecnica\`: o que isso PROVAVELMENTE significa no código \
(qual rota, qual componente, qual camada — server action, RLS, UI, etc). \
Cite arquivos ou diretórios prováveis quando possível (ex: "em \
src/app/(app)/budgets/[id]/budget-editor.tsx na seção de auto-save").
  c. \`sugestao_acao\`: O QUE fazer. Descreva a correção em uma frase forte.

Campo \`prompt_cloud_code\` (OBRIGATÓRIO, crítico):
Um prompt acionável pronto para colar em uma NOVA sessão do Claude Code / \
Cloud Code. Escreva em segunda pessoa ("Você deve..."), mirando um \
engenheiro-agente que NÃO tem o contexto desta análise.

Esse prompt precisa conter, de forma compacta:
 - O PROBLEMA em uma frase.
 - O IMPACTO (quem sente, quando, quão grave).
 - A ABORDAGEM TÉCNICA provável (qual arquivo mexer, qual função, qual \
padrão do projeto preservar — lembre-se: Next 16 App Router, Supabase com \
RLS, server actions 'use server', PostgREST, formatCurrency null-safe, \
workspace_members para isolar tenant, storage com path por user_id).
 - O CRITÉRIO DE ACEITE (como validar que ficou pronto).
 - As SKILLS / agentes relevantes quando fizer sentido: /bug-hunter, \
/development, /ui-skills, /supabase, /database-admin, /deployment-engineer, \
/orchestrate-batch-refactor, /full-stack-orchestration-full-stack-feature.

NÃO escreva prompt genérico tipo "corrija o bug". Escreva prompt que um \
engenheiro conseguiria executar em 30 minutos, sem voltar pedindo contexto.
Tamanho: 600–1500 caracteres. Use quebras de linha para legibilidade.

Seja cirúrgico. Feedback longo do usuário ≠ resumo longo seu. \
O \`resumo\` tem NO MÁXIMO 160 caracteres.`

/** Schema para structured output (json_schema strict) do OpenAI. */
export const FEEDBACK_ANALYSIS_SCHEMA = {
  name: 'feedback_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'resumo',
      'tipo',
      'severidade',
      'urgencia',
      'area_afetada',
      'explicacao_humana',
      'interpretacao_tecnica',
      'sugestao_acao',
      'proximo_passo',
      'tags',
      'priority_score',
      'priority_justificativa',
      'bloqueia_uso',
      'bucket',
      'prompt_cloud_code',
    ],
    properties: {
      resumo:                 { type: 'string', maxLength: 200 },
      tipo:                   { type: 'string', enum: ['bug', 'ux', 'melhoria', 'duvida', 'irrelevante', 'outro'] },
      severidade:             { type: 'string', enum: ['critica', 'alta', 'media', 'baixa'] },
      urgencia:               { type: 'string', enum: ['agora', 'essa_semana', 'esse_mes', 'algum_dia'] },
      area_afetada:           { type: 'string' },
      explicacao_humana:      { type: 'string' },
      interpretacao_tecnica:  { type: 'string' },
      sugestao_acao:          { type: 'string' },
      proximo_passo:          { type: 'string' },
      tags:                   { type: 'array', items: { type: 'string' } },
      priority_score:         { type: 'integer', minimum: 0, maximum: 100 },
      priority_justificativa: { type: 'string' },
      bloqueia_uso:           { type: 'boolean' },
      bucket:                 { type: 'string', enum: ['agora', 'depois', 'aguardar'] },
      prompt_cloud_code:      { type: 'string' },
    },
  },
} as const

/** Monta o prompt user-facing com contexto do feedback. */
export function buildFeedbackUserPrompt(input: {
  rawText: string | null
  transcript: string | null
  userDeclaredType: string | null
  sourcePage: string | null
  email: string | null
  userAgent: string | null
  attachmentFilename?: string | null
  attachmentMime?: string | null
}): string {
  const parts: string[] = []

  parts.push('FEEDBACK RECEBIDO:')
  if (input.rawText && input.rawText.trim()) {
    parts.push(`\nTexto digitado:\n"""\n${input.rawText.trim()}\n"""`)
  }
  if (input.transcript && input.transcript.trim()) {
    parts.push(`\nTranscrição do áudio:\n"""\n${input.transcript.trim()}\n"""`)
  }
  if (!input.rawText && !input.transcript) {
    parts.push('\n(sem conteúdo de texto disponível)')
  }

  parts.push('\n\nMETADADOS:')
  if (input.userDeclaredType) parts.push(`- Tipo declarado pelo usuário: ${input.userDeclaredType}`)
  if (input.sourcePage)       parts.push(`- Página de origem: ${input.sourcePage}`)
  if (input.email)            parts.push(`- Email (referência): ${input.email}`)
  if (input.userAgent)        parts.push(`- User-Agent: ${input.userAgent}`)
  if (input.attachmentFilename) {
    parts.push(`- Anexo: ${input.attachmentFilename} (${input.attachmentMime ?? 'tipo desconhecido'}) — o usuário considerou relevante mandar junto. Provavelmente print de tela com evidência visual.`)
  }

  parts.push('\n\nProduza o JSON estruturado conforme o schema.')
  return parts.join('\n')
}
