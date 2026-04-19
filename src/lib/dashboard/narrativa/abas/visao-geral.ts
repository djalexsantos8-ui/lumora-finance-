// ─── Narrativa · Aba Visão Geral ─────────────────────────────────────────────
//
// Transforma a saída dos agregadores em narrativa humana pra aba "Visão Geral".
//
// Função PURA. Não faz fetch. Não recalcula nada. Só lê e interpreta.
//
// Público-alvo: fotógrafo/filmmaker que não sabe ler dashboard.
// Por isso: ZERO jargão. Nada de YTD, MoM, runway, breakeven. Tudo traduzido.
//
// Estrutura:
//   · VEREDICTO   — pergunta "Você tá ganhando dinheiro este mês?" + resposta
//   · LEITURA     — parágrafo de 2–4 frases explicando o que os números dizem
//   · DESCOBERTAS — 3–5 fatos concretos (financeiros + comerciais)
//   · SUBLABELS   — cada KPI com explicação inline ("de cada R$ 100 que entra…")

import type { InadimplenciaData } from '../../aggregators/inadimplencia'
import type { VisaoGeralData }    from '../../aggregators/visao-geral'
import type { ReceitaData }       from '../../aggregators/receita'
import type { CustosData }        from '../../aggregators/custos'
import type { ClientesData }      from '../../aggregators/clientes'

import {
  fmtBRL,
  fmtPct,
  fmtMeses,
  fmtDelta,
  ordenaPorGravidade,
  type AbaNarrativa,
  type Veredicto,
  type Leitura,
  type Descoberta,
  type Sublabel,
  type Tom,
} from '../types'

// ─── Thresholds (calibráveis — alinhados com diagnostico.ts) ─────────────────

const T = {
  health: {
    forte:   70,
    atencao: 40,
  },
  runway: {
    confortavel: 3,
    curto:       2,
  },
  margem: {
    forte:     25,    // % — margem saudável pra serviço criativo
    apertada:  15,    // % — abaixo disso tá fino
  },
  top1: {
    peso_alerta: 30,    // % — cliente começa a pesar demais
    peso_critico: 40,   // % — dependência crítica
  },
  fixos: {
    pesados: 60,        // % do custo total — conta que chega todo mês
  },
  queda_relevante: 5,   // % — ignora oscilação pequena no MoM
} as const

const MAX_DESCOBERTAS = 5

// ─── Contexto ────────────────────────────────────────────────────────────────

interface Ctx {
  inad:    InadimplenciaData
  visao:   VisaoGeralData
  receita: ReceitaData
  custos:  CustosData
  cli:     ClientesData
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────
//
// A pergunta é sempre a mesma: "Você está ganhando dinheiro este mês?".
// A resposta varia por cenário — do mais grave pro mais leve. Primeira regra
// que bate, ganha.

function buildVeredicto(ctx: Ctx): Veredicto {
  const { visao, receita, cli } = ctx
  const pergunta = 'Você está ganhando dinheiro este mês?'

  const provaBasica = `Resultado ${fmtBRL(visao.resultado_mes)} · margem ${fmtPct(visao.margem_mes_pct, 0)}`

  // ── CRÍTICO ──────────────────────────────────────────────────────────────

  // Gastou mais do que ganhou
  if (visao.resultado_mes < 0) {
    return {
      pergunta,
      tese:    'Não.',
      nuance:  `Você gastou ${fmtBRL(Math.abs(visao.resultado_mes))} a mais do que entrou este mês.`,
      prova:   `Receita ${fmtBRL(visao.receita_mes)} · custo ${fmtBRL(visao.custo_mes)}`,
      tom:     'critico',
    }
  }

  // Saúde crítica sem fechar no vermelho (improvável, mas possível)
  if (visao.health_score < T.health.atencao) {
    return {
      pergunta,
      tese:    'Só no limite.',
      nuance:  'Fechou no azul, mas a operação tá bamba em vários pontos.',
      prova:   `Saúde ${visao.health_score}/100 · ${provaBasica}`,
      tom:     'critico',
    }
  }

  // ── ATENÇÃO ──────────────────────────────────────────────────────────────

  if (visao.health_score < T.health.forte) {
    // Caixa apertado
    if (visao.runway_meses < T.runway.curto && visao.custo_mes > 0) {
      return {
        pergunta,
        tese:    'Sim, mas no aperto.',
        nuance:  `Se a receita parasse hoje, seu caixa cobriria só ${fmtMeses(visao.runway_meses)}.`,
        prova:   provaBasica,
        tom:     'atencao',
      }
    }

    // Receita em queda relevante
    if (receita.mom_pct <= -T.queda_relevante) {
      return {
        pergunta,
        tese:    'Sim, mas escorregando.',
        nuance:  `Você faturou ${fmtPct(Math.abs(receita.mom_pct), 0)} a menos do que no mês passado.`,
        prova:   provaBasica,
        tom:     'atencao',
      }
    }

    // Dependência de 1 cliente
    if (cli.concentracao.top1_pct >= T.top1.peso_alerta) {
      const topName = cli.ranking_receita[0]?.cliente ?? 'um cliente'
      return {
        pergunta,
        tese:    'Sim, mas com um detalhe.',
        nuance:  `${topName} sozinho representa ${fmtPct(cli.concentracao.top1_pct, 0)} da sua receita.`,
        prova:   provaBasica,
        tom:     'atencao',
      }
    }

    // Atenção genérico
    return {
      pergunta,
      tese:    'Sim, mas sem folga pra errar.',
      nuance:  'Tá no verde, porém um mês ruim pode apertar.',
      prova:   provaBasica,
      tom:     'atencao',
    }
  }

  // ── POSITIVO ─────────────────────────────────────────────────────────────

  // Crescendo em 2 janelas (mês e ano)
  if (receita.mom_pct > 0 && receita.yoy_pct > 0) {
    return {
      pergunta,
      tese:    'Sim. E crescendo.',
      nuance:  `Você faturou ${fmtPct(receita.mom_pct, 0)} a mais que no mês passado e ${fmtPct(receita.yoy_pct, 0)} a mais que há um ano.`,
      prova:   provaBasica,
      tom:     'positivo',
    }
  }

  // Margem forte
  if (visao.margem_mes_pct >= T.margem.forte) {
    return {
      pergunta,
      tese:    'Sim.',
      nuance:  `De cada R$ 100 que entrou, R$ ${Math.round(visao.margem_mes_pct)} ficaram com você — margem saudável pra serviço criativo.`,
      prova:   provaBasica,
      tom:     'positivo',
    }
  }

  // Positivo genérico (saudável mas sem destaque)
  return {
    pergunta,
    tese:    'Sim.',
    nuance:  'Operação saudável, sobrou dinheiro depois de pagar tudo.',
    prova:   provaBasica,
    tom:     'positivo',
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────
//
// Parágrafo executivo. Monta em pedaços (frases) baseado no cenário —
// cada frase tem um papel: o que aconteceu, o que significa pra caixa,
// a tendência, e (se crítico) o alerta final.

function buildLeitura(ctx: Ctx): Leitura {
  const { visao, receita } = ctx
  const frases: string[] = []

  // ── Frase 1 — o que aconteceu no resultado ──────────────────────────────
  if (visao.resultado_mes > 0) {
    frases.push(
      `Sua operação rendeu ${fmtBRL(visao.resultado_mes)} este mês — ou seja, depois de pagar tudo, sobrou isso de lucro.` +
      ` De cada R$ 100 que entrou, R$ ${Math.round(visao.margem_mes_pct)} ficaram com você.`
    )
  } else if (visao.resultado_mes === 0) {
    frases.push(
      `Este mês você empatou: o que entrou pagou exatamente o que saiu, sem sobra.`
    )
  } else {
    frases.push(
      `Este mês você fechou no vermelho: gastou ${fmtBRL(Math.abs(visao.resultado_mes))} a mais do que faturou.` +
      ` Se continuar assim, o dinheiro vai terminar antes que você perceba.`
    )
  }

  // ── Frase 2 — fôlego de caixa ───────────────────────────────────────────
  if (visao.custo_mes > 0) {
    if (visao.runway_meses >= T.runway.confortavel) {
      frases.push(
        `Se a receita parasse agora, você aguentaria ${fmtMeses(visao.runway_meses)} só com o que já tá entrando — é um fôlego confortável.`
      )
    } else if (visao.runway_meses >= T.runway.curto) {
      frases.push(
        `Seu fôlego de caixa cobre ${fmtMeses(visao.runway_meses)} — dá tempo de reagir se algum cliente atrasar, mas não é folgado.`
      )
    } else {
      frases.push(
        `Se a receita parar agora, o caixa aguenta menos de ${fmtMeses(T.runway.curto)}. Qualquer atraso de cliente vira aperto real.`
      )
    }
  }

  // ── Frase 3 — tendência (só se relevante) ──────────────────────────────
  if (receita.mom_pct <= -T.queda_relevante) {
    frases.push(
      `Atenção: você faturou ${fmtPct(Math.abs(receita.mom_pct), 0)} a menos que no mês passado. Não é oscilação normal — é queda.`
    )
  } else if (receita.mom_pct >= 10) {
    frases.push(
      `E melhor: você faturou ${fmtPct(receita.mom_pct, 0)} a mais que no mês passado — é um bom momento pra consolidar o que está funcionando.`
    )
  }

  const paragrafo = frases.join(' ')
  const tom: Tom =
      visao.resultado_mes < 0 || visao.runway_meses < T.runway.curto ? 'critico'
    : receita.mom_pct <= -T.queda_relevante                          ? 'atencao'
    : visao.health_score < T.health.forte                            ? 'atencao'
    : 'positivo'

  return { paragrafo, tom }
}

// ─── N3 · Descobertas (financeiras + comerciais) ─────────────────────────────
//
// Regra: cada descoberta TEM que ter número. Nada de "sua margem está elevada".
// Sempre: "Sua margem é 28%". Sempre o nome do cliente se é comercial.
//
// Mistura intencional:
//   · FINANCEIRA  — onde você tá bem/mal na saúde geral
//   · COMERCIAL   — quem paga bem, quem paga mal, onde insistir ou recuar

function buildDescobertas(ctx: Ctx): Descoberta[] {
  const { visao, custos, cli } = ctx
  const out: Descoberta[] = []

  // ── FINANCEIRAS ─────────────────────────────────────────────────────────

  // Margem forte (>= 25%)
  if (visao.margem_mes_pct >= T.margem.forte && visao.resultado_mes > 0) {
    out.push({
      codigo:    'D_MARGEM_FORTE',
      texto:     `Sua margem está em ${fmtPct(visao.margem_mes_pct, 0)}. Pra serviço criativo, acima de ${T.margem.forte}% é considerado saudável — você tá dentro disso.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  // Margem apertada (< 15% e positiva)
  if (visao.margem_mes_pct > 0 && visao.margem_mes_pct < T.margem.apertada) {
    out.push({
      codigo:    'D_MARGEM_APERTADA',
      texto:     `De cada R$ 100 que entrou, só R$ ${Math.round(visao.margem_mes_pct)} sobraram pra você. Tem gasto comendo mais do que deveria.`,
      gravidade: 'atencao',
      dimensao:  'financeira',
    })
  }

  // Custo fixo pesado
  if (custos.fixos_pct >= T.fixos.pesados && custos.custo_total_mes > 0) {
    out.push({
      codigo:    'D_FIXO_PESADO',
      texto:     `${fmtPct(custos.fixos_pct, 0)} do seu custo é fixo (${fmtBRL(custos.fixos_mes)}/mês). Essa conta chega todo mês, tendo trabalho ou não.`,
      gravidade: 'atencao',
      dimensao:  'financeira',
    })
  }

  // ── COMERCIAIS (puxando do ranking de clientes) ─────────────────────────

  const rankComReceita = cli.ranking_receita.filter(c => c.receita > 0)

  if (rankComReceita.length >= 2) {
    // Mediana de margem (proxy rápido — clientes estão ordenados por receita)
    const margens   = rankComReceita.map(c => c.margem_pct).sort((a, b) => a - b)
    const mediana   = margens[Math.floor(margens.length / 2)]
    const melhor    = rankComReceita.reduce((a, b) => (b.margem_pct > a.margem_pct ? b : a))

    // Cliente mais lucrativo — só conta se DESTACA (>= mediana + 10pp e margem forte)
    if (melhor.margem_pct >= mediana + 10 && melhor.margem_pct >= T.margem.forte) {
      out.push({
        codigo:    'D_MELHOR_CLIENTE',
        texto:     `${melhor.cliente} te rende ${fmtBRL(melhor.receita)} com margem de ${fmtPct(melhor.margem_pct, 0)} — o mais lucrativo da sua base. Vale buscar mais clientes com esse perfil.`,
        gravidade: 'positivo',
        dimensao:  'comercial',
      })
    }

    // Cliente caro — representa receita mas margem baixa
    const problematico = rankComReceita.find(
      c => c.pct >= 10 && c.margem_pct < T.margem.apertada && c.cliente !== melhor.cliente
    )
    if (problematico) {
      out.push({
        codigo:    'D_CLIENTE_CARO',
        texto:     `${problematico.cliente} pesa ${fmtPct(problematico.pct, 0)} da sua receita, mas só deixa ${fmtPct(problematico.margem_pct, 0)} de margem. Muita conta, pouca sobra — é hora de revisar preço.`,
        gravidade: 'atencao',
        dimensao:  'comercial',
      })
    }
  }

  // Concentração em 1 cliente
  const topCliente = cli.ranking_receita[0]
  if (topCliente && cli.concentracao.top1_pct >= T.top1.peso_alerta) {
    const critico = cli.concentracao.top1_pct >= T.top1.peso_critico
    out.push({
      codigo:    'D_CONCENTRACAO',
      texto:     critico
        ? `${topCliente.cliente} sozinho responde por ${fmtPct(cli.concentracao.top1_pct, 0)} da sua receita. Se ele sair, quase metade do seu negócio vai junto.`
        : `${topCliente.cliente} responde por ${fmtPct(cli.concentracao.top1_pct, 0)} da sua receita — é seu maior cliente, e também seu maior risco.`,
      gravidade: critico ? 'critico' : 'atencao',
      dimensao:  'comercial',
    })
  }

  return ordenaPorGravidade(out).slice(0, MAX_DESCOBERTAS)
}

// ─── N2 · Sublabels (educação INLINE nos KPIs) ───────────────────────────────
//
// A educação não é tooltip. Ela mora embaixo do número, em 1 linha.
// Formato: `{tradução do conceito} · {contexto/comparação}`.

function buildSublabels(ctx: Ctx): Record<string, Sublabel> {
  const { visao, receita } = ctx

  const custoPctReceita = visao.receita_mes > 0
    ? Math.round((visao.custo_mes / visao.receita_mes) * 100)
    : 0

  return {
    health_score: {
      label:    'Saúde financeira',
      sublabel: 'Nota de 0 a 100. Junta margem, fôlego de caixa, crescimento e inadimplência num só número.',
    },

    receita_mes: {
      label:    'Receita do mês',
      sublabel: `O que caiu na conta este mês · cada job rendeu em média ${fmtBRL(receita.ticket_medio)}`,
      trend:    receita.mom_pct !== 0 ? `${fmtDelta(receita.mom_pct)} vs mês passado` : undefined,
    },

    custo_mes: {
      label:    'Custo do mês',
      sublabel: `Fixos (aluguel, software, parcelas) + variáveis (cada job) · representa ${custoPctReceita}% da receita`,
    },

    resultado_mes: {
      label:    'Resultado do mês',
      sublabel: `O que sobrou depois de pagar tudo · margem de ${fmtPct(visao.margem_mes_pct, 0)}`,
    },

    margem_mes_pct: {
      label:    'Margem',
      sublabel: visao.margem_mes_pct > 0
        ? `De cada R$ 100 que entrou, R$ ${Math.round(visao.margem_mes_pct)} ficaram com você`
        : 'De cada R$ 100 que entrou, nada sobrou — custo passou da receita',
    },

    runway_meses: {
      label:    'Fôlego de caixa',
      sublabel: 'Se a receita parar hoje, quantos meses você aguenta só com o que tá entrando',
    },

    delta_mom: {
      label:    'Variação vs mês passado',
      sublabel: receita.mom_pct === 0
        ? 'Sem mês anterior pra comparar'
        : receita.mom_pct > 0
          ? `Você faturou ${fmtPct(receita.mom_pct, 0)} a mais que o mês passado`
          : `Você faturou ${fmtPct(Math.abs(receita.mom_pct), 0)} a menos que o mês passado`,
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa completa da aba Visão Geral.
 *
 * Pura. Lê os 5 agregadores (inad + visão + receita + custos + clientes) e
 * devolve o bloco narrativo pronto pra UI renderizar.
 */
export function calcNarrativaVisaoGeral(
  inadimplencia: InadimplenciaData,
  visaoGeral:    VisaoGeralData,
  receita:       ReceitaData,
  custos:        CustosData,
  clientes:      ClientesData
): AbaNarrativa {
  const ctx: Ctx = {
    inad:    inadimplencia,
    visao:   visaoGeral,
    receita,
    custos,
    cli:     clientes,
  }

  return {
    veredicto:   buildVeredicto(ctx),
    leitura:     buildLeitura(ctx),
    descobertas: buildDescobertas(ctx),
    sublabels:   buildSublabels(ctx),
  }
}
