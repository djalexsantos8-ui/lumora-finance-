// ─── Catálogo de tipos contratuais ──────────────────────────────────────────
//
// Define o shape (título, campos obrigatórios, origens sugeridas) de cada
// tipo de contrato. Usado pelo Builder para:
//   1. listar tipos aplicáveis à origem (elegibilidade contextual)
//   2. validar campos obrigatórios antes de marcar como "generated"
//   3. resolver placeholders do template
//
// O TEXTO de cada contrato vive em `./templates.ts` (separado para manter
// este arquivo enxuto e o template versionável independentemente).

import type { ContractType, ContractTypeMeta, ContractOriginKind } from '@/types/contract'

// ─── Placeholders comuns (reaproveitados em vários tipos) ─────────────────

export const COMMON_PLACEHOLDERS = {
  // Contratante (cliente)
  contratante_nome:      'Nome completo ou razão social do cliente',
  contratante_cpf:       'CPF (PF)',
  contratante_cnpj:      'CNPJ (PJ)',
  contratante_endereco:  'Endereço completo',
  contratante_email:     'E-mail de contato',
  contratante_telefone:  'Telefone',

  // Contratada (empresa do usuário)
  contratada_razao_social: 'Razão social da empresa',
  contratada_cnpj:         'CNPJ da empresa',
  contratada_cpf:          'CPF (MEI/autônomo)',
  contratada_endereco:     'Endereço da empresa',
  contratada_email:        'E-mail comercial',
  contratada_telefone:     'Telefone comercial',
  contratada_responsavel:  'Nome de quem assina pela empresa',

  // Projeto
  titulo_projeto:        'Título do projeto',
  descricao_projeto:     'Descrição do escopo',
  data_evento:           'Data do evento/projeto',
  local_evento:          'Local de execução',
  prazo_entrega:         'Prazo de entrega',

  // Financeiro
  valor_total:           'Valor total (R$)',
  valor_por_extenso:     'Valor por extenso',
  moeda:                 'Moeda',
  condicao_pagamento:    'Condição de pagamento',
  prazo_pagamento:       'Prazo de pagamento',

  // Jurídicas
  cidade_foro:           'Cidade do foro',
  data_assinatura:       'Data de assinatura',
  dias_aviso_previo:     'Dias de aviso prévio',
  pct_multa_cancelamento: '% de multa em cancelamento',
} as const

// ─── Catálogo dos 10 tipos ──────────────────────────────────────────────────

export const CONTRACT_CATALOG: Record<ContractType, ContractTypeMeta> = {
  wedding_photo: {
    id: 'wedding_photo',
    title: 'Fotografia de Casamento',
    audience: 'pf',
    summary: 'Cobertura fotográfica de cerimônia e recepção. Inclui entrega digital e direitos de uso.',
    suggestedOrigins: ['budget', 'freelance', 'order'],
    required: [
      'contratante_nome', 'contratante_cpf',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'valor_total', 'condicao_pagamento',
    ],
    placeholders: [
      'contratante_nome', 'contratante_cpf', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'local_evento', 'horas_cobertura',
      'qtd_fotos', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'pct_multa_cancelamento', 'dias_aviso_previo',
      'cidade_foro', 'data_assinatura',
    ],
  },

  wedding_video: {
    id: 'wedding_video',
    title: 'Filmagem de Casamento',
    audience: 'pf',
    summary: 'Produção audiovisual de cerimônia e recepção. Edição + entrega digital.',
    suggestedOrigins: ['budget', 'freelance', 'order'],
    required: [
      'contratante_nome', 'contratante_cpf',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'valor_total', 'condicao_pagamento',
    ],
    placeholders: [
      'contratante_nome', 'contratante_cpf', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'local_evento',
      'duracao_filme_final', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'pct_multa_cancelamento', 'dias_aviso_previo',
      'cidade_foro', 'data_assinatura',
    ],
  },

  institutional_video: {
    id: 'institutional_video',
    title: 'Vídeo Institucional',
    audience: 'pj',
    summary: 'Produção audiovisual para empresas — vídeo institucional, VT, conteúdo corporativo.',
    suggestedOrigins: ['budget', 'order', 'freelance'],
    required: [
      'contratante_nome', 'contratante_cnpj',
      'contratada_razao_social', 'contratada_cnpj',
      'valor_total', 'condicao_pagamento',
    ],
    placeholders: [
      'contratante_nome', 'contratante_cnpj', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'descricao_projeto', 'escopo_entregaveis',
      'prazo_entrega', 'cronograma_etapas',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'direitos_uso', 'exclusividade',
      'cidade_foro', 'data_assinatura',
    ],
  },

  institutional_photo: {
    id: 'institutional_photo',
    title: 'Fotografia Institucional',
    audience: 'pj',
    summary: 'Ensaio fotográfico corporativo — equipe, produto, ambiente, campanhas.',
    suggestedOrigins: ['budget', 'order', 'freelance'],
    required: [
      'contratante_nome', 'contratante_cnpj',
      'contratada_razao_social', 'contratada_cnpj',
      'valor_total', 'condicao_pagamento',
    ],
    placeholders: [
      'contratante_nome', 'contratante_cnpj', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'descricao_projeto', 'qtd_fotos', 'local_evento',
      'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'direitos_uso',
      'cidade_foro', 'data_assinatura',
    ],
  },

  fashion_photo: {
    id: 'fashion_photo',
    title: 'Fotografia de Moda',
    audience: 'any',
    summary: 'Editorial, campanha, lookbook ou catálogo — com cláusulas de direito de imagem.',
    suggestedOrigins: ['budget', 'order'],
    required: [
      'contratante_nome',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'valor_total', 'condicao_pagamento',
    ],
    placeholders: [
      'contratante_nome', 'contratante_documento', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'descricao_projeto', 'data_evento', 'local_evento',
      'qtd_fotos', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'direitos_uso', 'exclusividade',
      'cidade_foro', 'data_assinatura',
    ],
  },

  book_photo: {
    id: 'book_photo',
    title: 'Fotografia — Book Pessoal',
    audience: 'pf',
    summary: 'Ensaio individual — book, retratos, pré-wedding.',
    suggestedOrigins: ['budget', 'freelance'],
    required: [
      'contratante_nome', 'contratante_cpf',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'valor_total',
    ],
    placeholders: [
      'contratante_nome', 'contratante_cpf', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'local_evento',
      'qtd_fotos', 'qtd_trocas_roupa', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'direitos_uso',
      'cidade_foro', 'data_assinatura',
    ],
  },

  event_photo: {
    id: 'event_photo',
    title: 'Fotografia de Evento',
    audience: 'any',
    summary: 'Cobertura fotográfica de eventos sociais/corporativos — formaturas, feiras, shows.',
    suggestedOrigins: ['budget', 'freelance', 'order'],
    required: [
      'contratante_nome',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'valor_total',
    ],
    placeholders: [
      'contratante_nome', 'contratante_documento', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'local_evento',
      'horas_cobertura', 'qtd_fotos', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'cidade_foro', 'data_assinatura',
    ],
  },

  event_video: {
    id: 'event_video',
    title: 'Filmagem de Evento',
    audience: 'any',
    summary: 'Cobertura audiovisual de eventos — formaturas, congressos, feiras.',
    suggestedOrigins: ['budget', 'freelance', 'order'],
    required: [
      'contratante_nome',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'valor_total',
    ],
    placeholders: [
      'contratante_nome', 'contratante_documento', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'data_evento', 'local_evento',
      'horas_cobertura', 'duracao_filme_final', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'cidade_foro', 'data_assinatura',
    ],
  },

  freelance_b2b: {
    id: 'freelance_b2b',
    title: 'Freelance / Subcontratação B2B',
    audience: 'pj',
    summary: 'Contrato de prestação entre empresas — subcontratação de freelancer ou produtora parceira.',
    suggestedOrigins: ['freelance', 'budget'],
    required: [
      'contratante_nome', 'contratante_cnpj',
      'contratada_razao_social', 'contratada_cnpj',
      'descricao_projeto', 'valor_total',
    ],
    placeholders: [
      'contratante_nome', 'contratante_cnpj', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj', 'contratada_endereco',
      'descricao_projeto', 'escopo_entregaveis',
      'data_inicio', 'data_fim', 'prazo_entrega',
      'valor_total', 'valor_por_extenso', 'condicao_pagamento',
      'direitos_uso', 'confidencialidade',
      'cidade_foro', 'data_assinatura',
    ],
  },

  recurring_services: {
    id: 'recurring_services',
    title: 'Prestação de Serviços Recorrentes',
    audience: 'any',
    summary: 'Contrato mensal/trimestral de produção — social media, vídeo recorrente, fotografia regular.',
    suggestedOrigins: ['recurring', 'budget'],
    required: [
      'contratante_nome',
      'contratada_razao_social', 'contratada_cnpj',
      'valor_mensal', 'frequencia', 'escopo_entregaveis',
    ],
    placeholders: [
      'contratante_nome', 'contratante_documento', 'contratante_endereco',
      'contratada_razao_social', 'contratada_cnpj',
      'escopo_entregaveis', 'frequencia',
      'data_inicio', 'duracao_contrato',
      'valor_mensal', 'valor_por_extenso', 'dia_pagamento',
      'reajuste', 'dias_aviso_previo_rescisao',
      'cidade_foro', 'data_assinatura',
    ],
  },
}

export const CONTRACT_TYPES_LIST: ContractTypeMeta[] = Object.values(CONTRACT_CATALOG)

// ─── Sugestões por origem ──────────────────────────────────────────────────
//
// Dado um `originKind` + metadados leves, devolve os tipos de contrato mais
// prováveis. A listagem final pode incluir todos os tipos aplicáveis, mas
// os "suggested" ficam destacados.

export function suggestContractTypes(
  originKind: ContractOriginKind,
  hints?: { segment?: string | null; category?: string | null }
): ContractType[] {
  const segment = (hints?.segment || hints?.category || '').toLowerCase()

  // Heurística: se o segmento/categoria bate com "casamento", prioriza casamento
  if (segment.includes('casamento') || segment.includes('wedding')) {
    return ['wedding_photo', 'wedding_video']
  }
  if (segment.includes('institucional') || segment.includes('corporat')) {
    return ['institutional_video', 'institutional_photo', 'freelance_b2b']
  }
  if (segment.includes('moda') || segment.includes('fashion')) {
    return ['fashion_photo']
  }
  if (segment.includes('book') || segment.includes('ensaio') || segment.includes('retrato')) {
    return ['book_photo']
  }
  if (segment.includes('evento') || segment.includes('event') || segment.includes('formatura')) {
    return ['event_photo', 'event_video']
  }

  // Fallback: filtra por origem
  return CONTRACT_TYPES_LIST
    .filter(t => t.suggestedOrigins.includes(originKind))
    .map(t => t.id)
}

export function getContractMeta(type: ContractType): ContractTypeMeta {
  return CONTRACT_CATALOG[type]
}
