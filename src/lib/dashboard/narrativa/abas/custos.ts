// ─── Narrativa · Aba Custos & Despesas ───────────────────────────────────────
//
// Transforma CustosData em narrativa humana.
//
// Pergunta que essa aba responde:
//   "Meu custo é sustentável ou tá me engolindo?"
//
// ZERO jargão. Traduções aplicadas:
//   custo fixo            → "conta que chega todo mês" (aluguel, software, parcelas)
//   custo variável        → "gasto que só aparece quando tem job"
//   custo_receita_ratio   → "de cada R$ 100 que entra, R$ X vão embora em custo"
//   ponto de equilíbrio   → "quanto você precisa faturar pra não ficar no vermelho"

import type { CustosData }  from '../../aggregators/custos'
import type { ReceitaData } from '../../aggregators/receita'

import {
  fmtBRL,
  fmtPct,
  ordenaPorGravidade,
  type AbaNarrativa,
  type Veredicto,
  type Leitura,
  type Descoberta,
  type Sublabel,
  type Tom,
} from '../types'

// ─── Thresholds ──────────────────────────────────────────────────────────────

const T = {
  ratio: {
    saudavel: 0.60,   // < 60% da receita em custo = operação respira
    alerta:   0.60,   // 60–80% = margem apertada
    critico:  0.80,   // >= 80% = sufocando
  },
  fixos: {
    equilibrado: 40,  // < 40% fixo = flexibilidade
    pesado:      60,  // >= 60% = conta grande chegando todo mês
  },
  concentracao_categoria: {
    dominante: 40,    // 1 categoria com >= 40% do custo — alto risco se ela mexer
  },
} as const

const MAX_DESCOBERTAS = 5

// ─── Contexto ────────────────────────────────────────────────────────────────

interface Ctx {
  cus: CustosData
  rec: ReceitaData
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────

function buildVeredicto(ctx: Ctx): Veredicto {
  const { cus, rec } = ctx
  const pergunta = 'Seu custo tá sob controle?'

  // Sem custo registrado
  if (cus.custo_total_mes === 0) {
    return {
      pergunta,
      tese:    'Sem gastos lançados.',
      nuance:  'Nenhuma despesa registrada este mês — ou você não teve custo mesmo, ou tá faltando lançar.',
      prova:   'R$ 0 em custo',
      tom:     'atencao',
    }
  }

  const provaBase = `${fmtBRL(cus.custo_total_mes)} de custo · ${fmtPct(cus.custo_receita_ratio * 100, 0)} da receita`

  // CRÍTICO — custo engole receita
  if (cus.custo_receita_ratio >= T.ratio.critico && rec.receita_mes > 0) {
    return {
      pergunta,
      tese:    'Não — tá no vermelho.',
      nuance:  `De cada R$ 100 que entrou, R$ ${Math.round(cus.custo_receita_ratio * 100)} já foram embora em custo. Quase nada sobra.`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // ATENÇÃO — custo apertando
  if (cus.custo_receita_ratio >= T.ratio.alerta && rec.receita_mes > 0) {
    return {
      pergunta,
      tese:    'Tá no limite.',
      nuance:  `Seu custo tá comendo ${fmtPct(cus.custo_receita_ratio * 100, 0)} da receita. Sobra pouco pra guardar ou crescer.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // ATENÇÃO — fixo pesado mesmo com ratio OK
  if (cus.fixos_pct >= T.fixos.pesado) {
    return {
      pergunta,
      tese:    'Mais ou menos.',
      nuance:  `${fmtPct(cus.fixos_pct, 0)} do seu custo é fixo (${fmtBRL(cus.fixos_mes)}/mês). Essa conta chega tendo job ou não — te deixa sem flexibilidade.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // POSITIVO — operação enxuta
  if (cus.custo_receita_ratio < T.ratio.saudavel && rec.receita_mes > 0) {
    return {
      pergunta,
      tese:    'Sim, operação enxuta.',
      nuance:  `Seu custo fica em ${fmtPct(cus.custo_receita_ratio * 100, 0)} da receita. Cada job fechado sobra bem.`,
      prova:   provaBase,
      tom:     'positivo',
    }
  }

  // POSITIVO genérico
  return {
    pergunta,
    tese:    'Sob controle.',
    nuance:  'Custo em patamar razoável, sem grandes distorções.',
    prova:   provaBase,
    tom:     'positivo',
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────

function buildLeitura(ctx: Ctx): Leitura {
  const { cus, rec } = ctx
  const frases: string[] = []

  // Frase 1 — foto do mês (custo total e divisão)
  if (cus.custo_total_mes === 0) {
    frases.push(
      `Nenhum custo lançado este mês. Ou você não teve gasto, ou ainda não registrou — vale conferir.`
    )
  } else {
    frases.push(
      `Este mês você gastou ${fmtBRL(cus.custo_total_mes)} ao todo — ${fmtBRL(cus.fixos_mes)} em contas que chegam todo mês (aluguel, software, parcelas) e ${fmtBRL(cus.variaveis_mes)} em gastos pontuais de job.`
    )
  }

  // Frase 2 — o peso na receita
  if (rec.receita_mes > 0 && cus.custo_total_mes > 0) {
    const pct = Math.round(cus.custo_receita_ratio * 100)
    if (cus.custo_receita_ratio >= T.ratio.critico) {
      frases.push(
        `Isso representa ${pct}% da sua receita — ou seja, de cada R$ 100 que caíram, R$ ${pct} já saíram de volta. Sobra muito pouco pra guardar ou crescer.`
      )
    } else if (cus.custo_receita_ratio >= T.ratio.alerta) {
      frases.push(
        `Isso representa ${pct}% da sua receita — sobra R$ ${100 - pct} de cada R$ 100, uma margem apertada pra qualquer imprevisto.`
      )
    } else {
      frases.push(
        `Isso representa ${pct}% da sua receita — sobra R$ ${100 - pct} de cada R$ 100, folga razoável pra guardar e crescer.`
      )
    }
  }

  // Frase 3 — ponto de equilíbrio (quando faz sentido calcular)
  if (cus.ponto_equilibrio > 0 && cus.fixos_mes > 0) {
    frases.push(
      `Na sua margem atual, você precisa faturar pelo menos ${fmtBRL(cus.ponto_equilibrio)} por mês só pra cobrir os custos fixos — abaixo disso, você fecha no vermelho sem nem perceber.`
    )
  }

  // Frase 4 — maior categoria (onde tá o dinheiro)
  if (cus.maior_categoria && cus.maior_categoria.pct >= T.concentracao_categoria.dominante) {
    frases.push(
      `A categoria que mais pesa é "${cus.maior_categoria.categoria}" (${fmtBRL(cus.maior_categoria.valor)}, ${fmtPct(cus.maior_categoria.pct, 0)} do total). Uma única frente de gasto tá dominando o mês — vale investigar se dá pra otimizar.`
    )
  }

  const paragrafo = frases.join(' ')
  const tom: Tom =
      cus.custo_receita_ratio >= T.ratio.critico && rec.receita_mes > 0 ? 'critico'
    : cus.custo_receita_ratio >= T.ratio.alerta  && rec.receita_mes > 0 ? 'atencao'
    : cus.fixos_pct           >= T.fixos.pesado                          ? 'atencao'
    : cus.custo_total_mes === 0                                          ? 'atencao'
    : 'positivo'

  return { paragrafo, tom }
}

// ─── N3 · Descobertas ────────────────────────────────────────────────────────

function buildDescobertas(ctx: Ctx): Descoberta[] {
  const { cus, rec } = ctx
  const out: Descoberta[] = []

  // ── FINANCEIRAS ─────────────────────────────────────────────────────────

  // Custo engolindo receita
  if (cus.custo_receita_ratio >= T.ratio.critico && rec.receita_mes > 0) {
    out.push({
      codigo:    'D_CUSTO_CRITICO',
      texto:     `${fmtPct(cus.custo_receita_ratio * 100, 0)} da sua receita do mês vira custo. De cada R$ 100, só R$ ${100 - Math.round(cus.custo_receita_ratio * 100)} sobram — praticamente você tá trabalhando pra pagar conta.`,
      gravidade: 'critico',
      dimensao:  'financeira',
    })
  } else if (cus.custo_receita_ratio >= T.ratio.alerta && rec.receita_mes > 0) {
    out.push({
      codigo:    'D_CUSTO_ALTO',
      texto:     `Seu custo come ${fmtPct(cus.custo_receita_ratio * 100, 0)} da receita. Tá funcionando, mas sem margem pra errar — qualquer queda de faturamento vira aperto.`,
      gravidade: 'atencao',
      dimensao:  'financeira',
    })
  } else if (cus.custo_receita_ratio > 0 && cus.custo_receita_ratio < T.ratio.saudavel && rec.receita_mes > 0) {
    out.push({
      codigo:    'D_CUSTO_ENXUTO',
      texto:     `Seu custo fica em ${fmtPct(cus.custo_receita_ratio * 100, 0)} da receita — operação enxuta. Cada job que você fecha rende de verdade.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  // Fixo pesado
  if (cus.fixos_pct >= T.fixos.pesado && cus.custo_total_mes > 0) {
    out.push({
      codigo:    'D_FIXO_PESADO',
      texto:     `${fmtPct(cus.fixos_pct, 0)} do seu custo é fixo (${fmtBRL(cus.fixos_mes)}/mês). Essa conta chega tendo trabalho ou não — se faltar job, ela não perdoa.`,
      gravidade: 'atencao',
      dimensao:  'financeira',
    })
  } else if (cus.fixos_pct > 0 && cus.fixos_pct < T.fixos.equilibrado && cus.custo_total_mes > 0) {
    out.push({
      codigo:    'D_ESTRUTURA_FLEXIVEL',
      texto:     `Só ${fmtPct(cus.fixos_pct, 0)} do seu custo é fixo — a maior parte varia com os jobs. Estrutura flexível, você consegue apertar o cinto em mês ruim.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  // Categoria dominante — risco de 1 frente de gasto
  if (cus.maior_categoria && cus.maior_categoria.pct >= T.concentracao_categoria.dominante) {
    out.push({
      codigo:    'D_CATEGORIA_DOMINANTE',
      texto:     `"${cus.maior_categoria.categoria}" sozinha responde por ${fmtPct(cus.maior_categoria.pct, 0)} do seu custo (${fmtBRL(cus.maior_categoria.valor)}). Corte ali é o que mais desafoga o mês.`,
      gravidade: 'atencao',
      dimensao:  'financeira',
    })
  }

  // Maior despesa individual do mês
  const topDesp = cus.top_despesas[0]
  if (topDesp && cus.custo_total_mes > 0) {
    const pctDoMes = Math.round((topDesp.valor / cus.custo_total_mes) * 100)
    if (pctDoMes >= 20) {
      out.push({
        codigo:    'D_TOP_DESPESA',
        texto:     `A maior despesa individual do mês foi "${topDesp.descricao}" (${fmtBRL(topDesp.valor)}), representando ${pctDoMes}% de tudo que você gastou. Confira se é reincidente ou pontual.`,
        gravidade: 'atencao',
        dimensao:  'financeira',
      })
    }
  }

  // Ponto de equilíbrio alto pra faturamento atual
  if (cus.ponto_equilibrio > 0 && rec.receita_mes > 0 && cus.ponto_equilibrio > rec.receita_mes) {
    const gap = cus.ponto_equilibrio - rec.receita_mes
    out.push({
      codigo:    'D_PONTO_EQUILIBRIO_ALTO',
      texto:     `Pra só cobrir custos fixos na margem atual, você precisaria faturar ${fmtBRL(cus.ponto_equilibrio)}/mês. Faltam ${fmtBRL(gap)} pra chegar nesse piso.`,
      gravidade: 'critico',
      dimensao:  'financeira',
    })
  }

  return ordenaPorGravidade(out).slice(0, MAX_DESCOBERTAS)
}

// ─── N2 · Sublabels ──────────────────────────────────────────────────────────

function buildSublabels(ctx: Ctx): Record<string, Sublabel> {
  const { cus, rec } = ctx

  return {
    custo_total_mes: {
      label:    'Custo do mês',
      sublabel: 'Soma de tudo que saiu da conta · contas fixas + gastos dos jobs',
    },

    fixos_mes: {
      label:    'Contas que chegam todo mês',
      sublabel: 'Aluguel, software, parcelas, internet · você paga tendo job ou não',
    },

    variaveis_mes: {
      label:    'Gastos de job',
      sublabel: 'O que você gasta só quando tem trabalho · materiais, deslocamento, repasses',
    },

    fixos_pct: {
      label:    'Peso do fixo no custo',
      sublabel: cus.fixos_pct >= T.fixos.pesado
        ? `${fmtPct(cus.fixos_pct, 0)} é fixo — estrutura pesada, pouca flexibilidade em mês fraco`
        : cus.fixos_pct < T.fixos.equilibrado
          ? `Só ${fmtPct(cus.fixos_pct, 0)} é fixo — estrutura leve, aguenta mês fraco`
          : `${fmtPct(cus.fixos_pct, 0)} é fixo — equilíbrio entre conta mensal e gasto por job`,
    },

    custo_receita_ratio: {
      label:    'Custo vs receita',
      sublabel: rec.receita_mes > 0
        ? `De cada R$ 100 que entrou, R$ ${Math.round(cus.custo_receita_ratio * 100)} saíram em custo · abaixo de 60% é considerado saudável`
        : 'Sem receita no mês pra comparar · lance um recebimento primeiro',
    },

    ponto_equilibrio: {
      label:    'Faturamento mínimo pra empatar',
      sublabel: cus.ponto_equilibrio > 0
        ? `Na sua margem atual, você precisa faturar ${fmtBRL(cus.ponto_equilibrio)}/mês só pra cobrir os fixos — abaixo disso, fecha no vermelho`
        : 'Ainda não dá pra calcular · precisa de margem positiva',
    },

    maior_categoria: {
      label:    'Onde mais vai dinheiro',
      sublabel: 'Categoria de custo que mais pesa este mês · por onde começar se precisar cortar',
    },

    por_categoria: {
      label:    'Custo por categoria',
      sublabel: 'Quebra de onde seu dinheiro tá saindo · ordenado do maior pro menor',
    },

    top_despesas: {
      label:    'Maiores despesas individuais',
      sublabel: 'As 5 maiores saídas do mês, uma a uma · pra você revisar linha por linha',
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa completa da aba Custos & Despesas.
 * Pura. Lê CustosData + ReceitaData (pra contextualizar custo vs receita do mês).
 */
export function calcNarrativaCustos(
  custos:  CustosData,
  receita: ReceitaData
): AbaNarrativa {
  const ctx: Ctx = { cus: custos, rec: receita }

  return {
    veredicto:   buildVeredicto(ctx),
    leitura:     buildLeitura(ctx),
    descobertas: buildDescobertas(ctx),
    sublabels:   buildSublabels(ctx),
  }
}
