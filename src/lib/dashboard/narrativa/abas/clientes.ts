// ─── Narrativa · Aba Clientes ────────────────────────────────────────────────
//
// Transforma ClientesData em narrativa humana.
//
// Pergunta que essa aba responde:
//   "Se eu perder 1 cliente, eu quebro?"
//
// Essa é A aba de INTELIGÊNCIA COMERCIAL — aqui vive:
//   · quem te dá dinheiro de verdade (alto volume + alta margem)
//   · quem pesa na receita mas não rende (ladrão de margem)
//   · quanto sua base depende de 1 pessoa
//   · se você tá renovando clientes ou só girando os mesmos
//
// ZERO jargão. Traduções aplicadas:
//   HHI                → "índice que mede o quanto sua carteira tá concentrada"
//   top1_pct           → "quanto seu maior cliente representa"
//   margem por cliente → "de cada R$ 100 que ele te paga, quanto sobra pra você"
//   novos vs recorrentes → "gente nova fechando vs sempre os mesmos"

import type { ClientesData } from '../../aggregators/clientes'
import type { ReceitaData }  from '../../aggregators/receita'

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
  top1: {
    diversificado: 20,  // < 20% = muito bem distribuído
    alerta:        30,  // 30-40% = cliente começa a pesar
    critico:       40,  // >= 40% = dependência crítica
  },
  hhi: {
    baixa:      1500,   // < 1500 = carteira saudável, diluída
    moderada:   2500,   // 1500-2500 = concentração moderada
    alta:       2500,   // >= 2500 = concentração alta, risco real
  },
  margem: {
    forte:     25,      // >= 25% = cliente que rende
    fraca:     15,      // < 15% = cliente caro
  },
  base: {
    pequena: 3,         // < 3 clientes = base ainda inicial
    boa:     10,        // >= 10 clientes = base robusta
  },
} as const

const MAX_DESCOBERTAS = 5

// ─── Contexto ────────────────────────────────────────────────────────────────

interface Ctx {
  cli: ClientesData
  rec: ReceitaData
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────

function buildVeredicto(ctx: Ctx): Veredicto {
  const { cli } = ctx
  const pergunta = 'Sua carteira de clientes te sustenta sozinha?'

  // Sem clientes
  if (cli.total_clientes === 0) {
    return {
      pergunta,
      tese:    'Ainda não.',
      nuance:  'Nenhum cliente registrado. Primeiro passo é fechar o primeiro job.',
      prova:   '0 clientes ativos',
      tom:     'atencao',
    }
  }

  const topName = cli.ranking_receita[0]?.cliente ?? 'seu maior cliente'
  const provaBase = `${cli.total_clientes} cliente${cli.total_clientes === 1 ? '' : 's'} · maior pesa ${fmtPct(cli.concentracao.top1_pct, 0)}`

  // CRÍTICO — dependência extrema
  if (cli.concentracao.top1_pct >= T.top1.critico) {
    return {
      pergunta,
      tese:    'Não — você depende demais.',
      nuance:  `${topName} sozinho representa ${fmtPct(cli.concentracao.top1_pct, 0)} da sua receita. Se ele te deixar, quase metade do seu negócio vai junto.`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // CRÍTICO — HHI alto (carteira muito concentrada mesmo sem 1 dominante)
  if (cli.hhi >= T.hhi.alta && cli.total_clientes < T.base.boa) {
    return {
      pergunta,
      tese:    'Tá num fio só.',
      nuance:  `Sua carteira tá bem concentrada: poucos clientes carregam quase toda a receita. Um deles sai, você sente forte.`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // ATENÇÃO — top1 pesado
  if (cli.concentracao.top1_pct >= T.top1.alerta) {
    return {
      pergunta,
      tese:    'Parcialmente.',
      nuance:  `${topName} responde por ${fmtPct(cli.concentracao.top1_pct, 0)} da receita — é seu melhor cliente, e também seu maior risco. Se ele sumir, dói.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // ATENÇÃO — base pequena
  if (cli.total_clientes < T.base.pequena) {
    return {
      pergunta,
      tese:    'Depende de poucos.',
      nuance:  `Você tem ${cli.total_clientes} cliente${cli.total_clientes === 1 ? '' : 's'} ativo${cli.total_clientes === 1 ? '' : 's'}. Pouca gente pra absorver um desligamento.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // ATENÇÃO — só recorrentes, zero cliente novo no mês
  if (cli.novos_vs_recorrentes.novos === 0 && cli.novos_vs_recorrentes.recorrentes > 0) {
    return {
      pergunta,
      tese:    'Sim — mas sem sangue novo.',
      nuance:  `Este mês só rodou com clientes antigos. Sem entrada nova, você vive de quem já tem.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // POSITIVO — base diversificada
  if (cli.concentracao.top1_pct < T.top1.diversificado && cli.total_clientes >= T.base.boa) {
    return {
      pergunta,
      tese:    'Sim, bem distribuída.',
      nuance:  `Nenhum cliente passa de ${fmtPct(cli.concentracao.top1_pct, 0)} da receita, e você tem ${cli.total_clientes} pagando. Perder um não te derruba.`,
      prova:   provaBase,
      tom:     'positivo',
    }
  }

  // POSITIVO — base crescendo (novos + recorrentes)
  if (cli.novos_vs_recorrentes.novos > 0 && cli.novos_vs_recorrentes.recorrentes > 0) {
    return {
      pergunta,
      tese:    'Sim — e ainda entra gente nova.',
      nuance:  `Este mês teve ${cli.novos_vs_recorrentes.recorrentes} cliente${cli.novos_vs_recorrentes.recorrentes === 1 ? '' : 's'} recorrente${cli.novos_vs_recorrentes.recorrentes === 1 ? '' : 's'} e ${cli.novos_vs_recorrentes.novos} novo${cli.novos_vs_recorrentes.novos === 1 ? '' : 's'}. Mistura saudável.`,
      prova:   provaBase,
      tom:     'positivo',
    }
  }

  // POSITIVO genérico
  return {
    pergunta,
    tese:    'Dá pra dizer que sim.',
    nuance:  'Base razoável, nenhum cliente dominando sozinho.',
    prova:   provaBase,
    tom:     'positivo',
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────

function buildLeitura(ctx: Ctx): Leitura {
  const { cli } = ctx
  const frases: string[] = []

  if (cli.total_clientes === 0) {
    frases.push('Você ainda não tem cliente ativo. Toda inteligência comercial começa aqui — quando o primeiro job cair, os números começam a contar história.')
    return { paragrafo: frases.join(' '), tom: 'atencao' }
  }

  // Frase 1 — foto da base
  const nomeClientes = cli.total_clientes === 1 ? 'cliente ativo' : 'clientes ativos'
  frases.push(
    `Você tem ${cli.total_clientes} ${nomeClientes} na carteira${
      cli.novos_vs_recorrentes.novos > 0
        ? ` — sendo ${cli.novos_vs_recorrentes.novos} que entraram este mês`
        : ''
    }.`
  )

  // Frase 2 — concentração (o ponto central da aba)
  const topName = cli.ranking_receita[0]?.cliente ?? 'seu maior cliente'
  if (cli.concentracao.top1_pct >= T.top1.critico) {
    frases.push(
      `${topName} sozinho representa ${fmtPct(cli.concentracao.top1_pct, 0)} de toda sua receita — ou seja, quase metade do que entra vem de uma pessoa só. Qualquer mudança na relação com ele balança o negócio inteiro.`
    )
  } else if (cli.concentracao.top1_pct >= T.top1.alerta) {
    frases.push(
      `${topName} é responsável por ${fmtPct(cli.concentracao.top1_pct, 0)} da receita. É bom que ele exista, mas é ruim que a dependência seja essa — vale abrir outras frentes antes que ele precise negociar por você.`
    )
  } else if (cli.concentracao.top1_pct < T.top1.diversificado && cli.total_clientes >= T.base.boa) {
    frases.push(
      `E o melhor: nenhum cliente pesa mais de ${fmtPct(cli.concentracao.top1_pct, 0)} da receita. Se qualquer um sair, você absorve sem sangrar.`
    )
  } else {
    frases.push(
      `${topName} é seu maior cliente e responde por ${fmtPct(cli.concentracao.top1_pct, 0)} da receita — patamar saudável, sem dependência crítica.`
    )
  }

  // Frase 3 — dinâmica (novos vs recorrentes)
  if (cli.novos_vs_recorrentes.novos === 0 && cli.novos_vs_recorrentes.recorrentes > 0) {
    frases.push(
      `Este mês rodou inteiro com clientes que já existiam. Sem entrada nova, a concentração só tende a subir — vale reativar captação.`
    )
  } else if (cli.novos_vs_recorrentes.novos >= 2) {
    frases.push(
      `E ainda entraram ${cli.novos_vs_recorrentes.novos} clientes novos este mês — sinal de que sua captação tá viva.`
    )
  }

  // Frase 4 — margem (qualidade, não só volume)
  const topByMargem = [...cli.ranking_receita]
    .filter(c => c.receita > 0)
    .sort((a, b) => b.margem_pct - a.margem_pct)[0]

  if (topByMargem && topByMargem.margem_pct >= T.margem.forte && cli.ranking_receita.length >= 3) {
    frases.push(
      `Atenção pra um detalhe que passa batido: ${topByMargem.cliente} é o que mais deixa margem (${fmtPct(topByMargem.margem_pct, 0)}) — não é o que mais fatura, mas é o que mais rende. Buscar mais clientes com esse perfil muda o jogo.`
    )
  }

  const paragrafo = frases.join(' ')
  const tom: Tom =
      cli.concentracao.top1_pct >= T.top1.critico                                 ? 'critico'
    : cli.hhi >= T.hhi.alta && cli.total_clientes < T.base.boa                    ? 'critico'
    : cli.concentracao.top1_pct >= T.top1.alerta                                  ? 'atencao'
    : cli.total_clientes < T.base.pequena                                         ? 'atencao'
    : cli.novos_vs_recorrentes.novos === 0 && cli.novos_vs_recorrentes.recorrentes > 0 ? 'atencao'
    : 'positivo'

  return { paragrafo, tom }
}

// ─── N3 · Descobertas (MUITA inteligência comercial aqui) ────────────────────

function buildDescobertas(ctx: Ctx): Descoberta[] {
  const { cli } = ctx
  const out: Descoberta[] = []

  if (cli.ranking_receita.length === 0) {
    return out
  }

  // ── CONCENTRAÇÃO (o risco central da aba) ───────────────────────────────

  const top = cli.ranking_receita[0]

  if (cli.concentracao.top1_pct >= T.top1.critico) {
    out.push({
      codigo:    'D_TOP1_CRITICO',
      texto:     `${top.cliente} sozinho representa ${fmtPct(cli.concentracao.top1_pct, 0)} da sua receita (${fmtBRL(top.receita)}). É o seu maior cliente e, ao mesmo tempo, seu maior risco — urgente diversificar.`,
      gravidade: 'critico',
      dimensao:  'comercial',
    })
  } else if (cli.concentracao.top1_pct >= T.top1.alerta) {
    out.push({
      codigo:    'D_TOP1_ALERTA',
      texto:     `${top.cliente} pesa ${fmtPct(cli.concentracao.top1_pct, 0)} da receita (${fmtBRL(top.receita)}). Ainda não é dependência crítica, mas já é um ponto de atenção.`,
      gravidade: 'atencao',
      dimensao:  'comercial',
    })
  } else if (cli.concentracao.top1_pct > 0 && cli.concentracao.top1_pct < T.top1.diversificado && cli.total_clientes >= T.base.boa) {
    out.push({
      codigo:    'D_BASE_DISTRIBUIDA',
      texto:     `Nenhum cliente passa de ${fmtPct(cli.concentracao.top1_pct, 0)} da receita, com ${cli.total_clientes} clientes ativos. Base bem diluída — você tá livre pra escolher com quem quer trabalhar.`,
      gravidade: 'positivo',
      dimensao:  'comercial',
    })
  }

  // ── QUALIDADE (margem, não volume) ──────────────────────────────────────

  if (cli.ranking_receita.length >= 2) {
    const comReceita = cli.ranking_receita.filter(c => c.receita > 0)
    const margens    = comReceita.map(c => c.margem_pct).sort((a, b) => a - b)
    const mediana    = margens[Math.floor(margens.length / 2)] ?? 0
    const melhorMg   = comReceita.reduce((a, b) => (b.margem_pct > a.margem_pct ? b : a))
    const piorMg     = comReceita.reduce((a, b) => (b.margem_pct < a.margem_pct ? b : a))

    // Cliente mais rentável (se destaca claramente)
    if (melhorMg.margem_pct >= T.margem.forte && melhorMg.margem_pct >= mediana + 10) {
      out.push({
        codigo:    'D_MELHOR_MARGEM',
        texto:     `${melhorMg.cliente} te rende ${fmtPct(melhorMg.margem_pct, 0)} de margem — o mais lucrativo da sua base (${fmtBRL(melhorMg.receita)} de receita). Procure mais clientes com esse perfil e evite atender o oposto.`,
        gravidade: 'positivo',
        dimensao:  'comercial',
      })
    }

    // Cliente que fatura muito e deixa pouca margem (ladrão de margem)
    const ladrao = comReceita.find(
      c => c.pct >= 10 && c.margem_pct < T.margem.fraca && c.cliente !== melhorMg.cliente
    )
    if (ladrao) {
      out.push({
        codigo:    'D_CLIENTE_LADRAO',
        texto:     `${ladrao.cliente} pesa ${fmtPct(ladrao.pct, 0)} da sua receita (${fmtBRL(ladrao.receita)}) mas deixa só ${fmtPct(ladrao.margem_pct, 0)} de margem. Muito barulho, pouca sobra — é hora de renegociar preço ou reduzir o esforço ali.`,
        gravidade: 'atencao',
        dimensao:  'comercial',
      })
    }

    // Pior margem explícita (se for extremamente baixa)
    if (
      piorMg.margem_pct < 5 &&
      piorMg.pct >= 5 &&
      piorMg.cliente !== melhorMg.cliente &&
      (!ladrao || ladrao.cliente !== piorMg.cliente)
    ) {
      out.push({
        codigo:    'D_MARGEM_NEGATIVA',
        texto:     `${piorMg.cliente} deixa praticamente nada de margem (${fmtPct(piorMg.margem_pct, 0)}). Provavelmente você tá operando esse cliente no zero — tempo gasto, dinheiro não.`,
        gravidade: 'atencao',
        dimensao:  'comercial',
      })
    }
  }

  // ── DINÂMICA (captação vs recorrência) ──────────────────────────────────

  if (cli.novos_vs_recorrentes.novos === 0 && cli.novos_vs_recorrentes.recorrentes > 0) {
    out.push({
      codigo:    'D_SEM_CAPTACAO',
      texto:     `Zero cliente novo este mês — você rodou inteiro com ${cli.novos_vs_recorrentes.recorrentes} recorrente${cli.novos_vs_recorrentes.recorrentes === 1 ? '' : 's'}. Sem captação, a concentração só piora com o tempo.`,
      gravidade: 'atencao',
      dimensao:  'comercial',
    })
  } else if (cli.novos_vs_recorrentes.novos >= 3) {
    out.push({
      codigo:    'D_CAPTACAO_ATIVA',
      texto:     `${cli.novos_vs_recorrentes.novos} clientes novos entraram este mês. Captação aquecida — é o momento de anotar o que tá trazendo essa gente e repetir.`,
      gravidade: 'positivo',
      dimensao:  'comercial',
    })
  }

  // ── ESTRUTURA (top 5 pesa demais?) ──────────────────────────────────────

  if (cli.concentracao.top5_pct >= 80 && cli.total_clientes >= 6) {
    out.push({
      codigo:    'D_TOP5_DOMINA',
      texto:     `Seus 5 maiores clientes respondem por ${fmtPct(cli.concentracao.top5_pct, 0)} da receita. O resto da base praticamente não contribui — se um desses 5 sair, você sente.`,
      gravidade: 'atencao',
      dimensao:  'comercial',
    })
  }

  return ordenaPorGravidade(out).slice(0, MAX_DESCOBERTAS)
}

// ─── N2 · Sublabels ──────────────────────────────────────────────────────────

function buildSublabels(ctx: Ctx): Record<string, Sublabel> {
  const { cli } = ctx

  return {
    total_clientes: {
      label:    'Clientes na base',
      sublabel: 'Quantos clientes distintos já te contrataram · base pequena = mais risco se alguém sair',
    },

    top1_pct: {
      label:    'Peso do maior cliente',
      sublabel: cli.concentracao.top1_pct >= T.top1.critico
        ? `Seu maior cliente responde por ${fmtPct(cli.concentracao.top1_pct, 0)} da receita — dependência crítica`
        : cli.concentracao.top1_pct >= T.top1.alerta
          ? `${fmtPct(cli.concentracao.top1_pct, 0)} da receita vem de uma pessoa só · atenção à dependência`
          : `Seu maior cliente pesa ${fmtPct(cli.concentracao.top1_pct, 0)} · patamar saudável`,
    },

    top5_pct: {
      label:    'Peso dos 5 maiores',
      sublabel: `Quanto da receita vem dos 5 principais clientes · acima de 80% é sinal de base muito concentrada`,
    },

    hhi: {
      label:    'Índice de concentração',
      sublabel: cli.hhi >= T.hhi.alta
        ? `Carteira muito concentrada — poucos clientes carregam quase tudo`
        : cli.hhi >= T.hhi.baixa
          ? `Concentração moderada — base existe, mas depende de alguns`
          : `Carteira bem diluída — muitos clientes contribuindo em equilíbrio`,
    },

    ranking_receita: {
      label:    'Quem mais te rende',
      sublabel: 'Clientes ordenados por receita · cada um com a margem que deixa (de cada R$ 100 que paga, quanto sobra pra você)',
    },

    novos_vs_recorrentes: {
      label:    'Novos vs recorrentes (mês)',
      sublabel: 'Quantos fecharam pela primeira vez esse mês vs quantos já eram clientes · mistura saudável é ter os dois',
    },

    dinamica_12m: {
      label:    'Histórico de novos × recorrentes',
      sublabel: 'Últimos 12 meses · mostra se sua captação tá viva ou se você só vive da base antiga',
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa completa da aba Clientes.
 *
 * A aba mais comercial do dashboard — aqui vive a inteligência de carteira:
 * quem te dá dinheiro, quem te dá margem, e quanto você depende de cada um.
 */
export function calcNarrativaClientes(
  clientes: ClientesData,
  receita:  ReceitaData
): AbaNarrativa {
  const ctx: Ctx = { cli: clientes, rec: receita }

  return {
    veredicto:   buildVeredicto(ctx),
    leitura:     buildLeitura(ctx),
    descobertas: buildDescobertas(ctx),
    sublabels:   buildSublabels(ctx),
  }
}
