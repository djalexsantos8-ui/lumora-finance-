// ─── Narrativa · Aba Receita & Recebimentos ──────────────────────────────────
//
// Transforma ReceitaData em narrativa humana.
//
// Pergunta que essa aba responde:
//   "Vou receber esse dinheiro mesmo? E quanto disso já caiu?"
//
// ZERO jargão. Traduções aplicadas:
//   confirmada     → "dinheiro que já caiu na conta"
//   prevista       → "promessa pra cobrar"
//   YTD            → "no ano até agora"
//   ticket médio   → "cada job rende, em média, R$ X"
//   pct_confirmada → "de tudo que você faturou este ano, X% virou dinheiro"
//   MoM / YoY      → "vs mês passado / vs mesmo mês ano passado"

import type { ReceitaData }  from '../../aggregators/receita'
import type { ClientesData } from '../../aggregators/clientes'

import {
  fmtBRL,
  fmtPct,
  fmtDelta,
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
  pct_confirmada: {
    alta:  70,   // >= 70% do ano já caiu
    media: 50,   // 50–70% ainda em promessa
    baixa: 30,   // < 30% — maior parte é papel
  },
  crescimento: {
    forte: 10,   // >= +10% é crescimento claro
    queda: 5,    // <= -5% é queda relevante (não oscilação)
  },
  top1_cliente: {
    peso_alerta:  30,   // % da receita YTD
    peso_critico: 40,
  },
} as const

const MAX_DESCOBERTAS = 5

// ─── Contexto ────────────────────────────────────────────────────────────────

interface Ctx {
  rec: ReceitaData
  cli: ClientesData
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────

function buildVeredicto(ctx: Ctx): Veredicto {
  const { rec } = ctx
  const pergunta = 'Quanto vai entrar — e quanto disso já é seu?'

  // Nada de receita ainda
  if (rec.receita_ytd === 0 && rec.prevista === 0) {
    return {
      pergunta,
      tese:    'Ainda nada.',
      nuance:  'Sem receita registrada este ano — nem confirmada, nem em aberto. É hora de fechar o primeiro job.',
      prova:   'R$ 0 recebido · R$ 0 previsto',
      tom:     'critico',
    }
  }

  const provaBase = `${fmtBRL(rec.confirmada)} já caíram · ${fmtBRL(rec.prevista)} ainda prometidos`

  // CRÍTICO — queda dupla (mês passado e ano passado)
  if (rec.mom_pct <= -T.crescimento.queda && rec.yoy_pct <= -T.crescimento.queda) {
    return {
      pergunta,
      tese:    'Menos do que antes.',
      nuance:  `Você faturou ${fmtPct(Math.abs(rec.mom_pct), 0)} a menos que no mês passado e ${fmtPct(Math.abs(rec.yoy_pct), 0)} a menos que há um ano. Não é oscilação, é tendência.`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // CRÍTICO — quase tudo ainda é promessa
  if (rec.pct_confirmada < T.pct_confirmada.baixa && rec.prevista > 0) {
    return {
      pergunta,
      tese:    'Pouco no bolso.',
      nuance:  `Só ${fmtPct(rec.pct_confirmada, 0)} do que você faturou este ano virou dinheiro de verdade. O resto (${fmtBRL(rec.prevista)}) ainda tá na promessa do cliente.`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // ATENÇÃO — metade ainda é papel
  if (rec.pct_confirmada < T.pct_confirmada.alta && rec.prevista > 0) {
    return {
      pergunta,
      tese:    'Em parte, sim.',
      nuance:  `${fmtPct(rec.pct_confirmada, 0)} do ano já caiu na conta. Falta puxar ${fmtBRL(rec.prevista)} que tão prometidos mas ainda não chegaram.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // ATENÇÃO — queda só no mês
  if (rec.mom_pct <= -T.crescimento.queda) {
    return {
      pergunta,
      tese:    'Tá entrando, mas escorregando.',
      nuance:  `${fmtPct(Math.abs(rec.mom_pct), 0)} a menos que no mês passado. Ainda dá pra virar se você acelerar a captação.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // POSITIVO — crescendo em duas janelas
  if (rec.mom_pct >= T.crescimento.forte && rec.yoy_pct >= T.crescimento.forte) {
    return {
      pergunta,
      tese:    'Bem — e crescendo.',
      nuance:  `Você faturou ${fmtPct(rec.mom_pct, 0)} a mais que no mês passado e ${fmtPct(rec.yoy_pct, 0)} a mais que há um ano. Momento de consolidar.`,
      prova:   provaBase,
      tom:     'positivo',
    }
  }

  // POSITIVO — receita do ano praticamente toda confirmada
  if (rec.pct_confirmada >= T.pct_confirmada.alta) {
    return {
      pergunta,
      tese:    'No bolso.',
      nuance:  `${fmtPct(rec.pct_confirmada, 0)} do que você faturou este ano já caiu na conta. O que fechou, virou dinheiro.`,
      prova:   provaBase,
      tom:     'positivo',
    }
  }

  // POSITIVO genérico
  return {
    pergunta,
    tese:    'Entrando bem.',
    nuance:  'Receita saudável entre o que já caiu e o que ainda vai cair.',
    prova:   provaBase,
    tom:     'positivo',
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────

function buildLeitura(ctx: Ctx): Leitura {
  const { rec } = ctx
  const frases: string[] = []

  // Frase 1 — foto do mês
  if (rec.receita_mes > 0) {
    frases.push(
      `Este mês entraram ${fmtBRL(rec.receita_mes)} na sua conta — dinheiro de jobs que já caiu.`
    )
  } else {
    frases.push(
      `Este mês ainda não caiu nada na conta. Qualquer coisa fechada até aqui ainda tá esperando pagamento.`
    )
  }

  // Frase 2 — ano até agora (confirmada vs prevista)
  if (rec.receita_ytd > 0 || rec.prevista > 0) {
    if (rec.pct_confirmada >= T.pct_confirmada.alta) {
      frases.push(
        `No ano, você já recebeu ${fmtBRL(rec.confirmada)} — isso representa ${fmtPct(rec.pct_confirmada, 0)} de tudo que faturou até agora. Faltam só ${fmtBRL(rec.prevista)} a cobrar.`
      )
    } else if (rec.pct_confirmada >= T.pct_confirmada.media) {
      frases.push(
        `No ano, você faturou ${fmtBRL(rec.confirmada + rec.prevista)} — mas só ${fmtBRL(rec.confirmada)} (${fmtPct(rec.pct_confirmada, 0)}) virou dinheiro. ${fmtBRL(rec.prevista)} ainda tá em forma de promessa.`
      )
    } else {
      frases.push(
        `Atenção: você faturou ${fmtBRL(rec.confirmada + rec.prevista)} no papel, mas só ${fmtPct(rec.pct_confirmada, 0)} disso (${fmtBRL(rec.confirmada)}) virou dinheiro de verdade. O resto depende da régua de cobrança.`
      )
    }
  }

  // Frase 3 — tendência relevante
  if (rec.mom_pct <= -T.crescimento.queda && rec.yoy_pct <= -T.crescimento.queda) {
    frases.push(
      `E tem um sinal amarelo: a receita caiu tanto vs mês passado (${fmtPct(Math.abs(rec.mom_pct), 0)}) quanto vs há um ano (${fmtPct(Math.abs(rec.yoy_pct), 0)}). Duas janelas caindo junto não é oscilação — é tendência.`
    )
  } else if (rec.mom_pct >= T.crescimento.forte) {
    frases.push(
      `Você faturou ${fmtPct(rec.mom_pct, 0)} a mais que no mês passado — ritmo acelerando, é um bom momento pra olhar o que tá funcionando e repetir.`
    )
  }

  // Frase 4 — próximas entradas (visibilidade de curto prazo)
  const proxTotal = rec.proximas_entradas.d30 + rec.proximas_entradas.d60 + rec.proximas_entradas.d90
  if (proxTotal > 0) {
    frases.push(
      `Nos próximos 90 dias, a agenda mostra ${fmtBRL(proxTotal)} a receber — sendo ${fmtBRL(rec.proximas_entradas.d30)} já nos próximos 30.`
    )
  }

  const paragrafo = frases.join(' ')
  const tom: Tom =
      (rec.mom_pct <= -T.crescimento.queda && rec.yoy_pct <= -T.crescimento.queda) ? 'critico'
    : rec.pct_confirmada < T.pct_confirmada.baixa && rec.prevista > 0                ? 'critico'
    : rec.mom_pct <= -T.crescimento.queda                                            ? 'atencao'
    : rec.pct_confirmada < T.pct_confirmada.alta && rec.prevista > 0                 ? 'atencao'
    : 'positivo'

  return { paragrafo, tom }
}

// ─── N3 · Descobertas (financeiras + comerciais) ─────────────────────────────

function buildDescobertas(ctx: Ctx): Descoberta[] {
  const { rec, cli } = ctx
  const out: Descoberta[] = []

  // ── FINANCEIRAS ─────────────────────────────────────────────────────────

  // Muita receita ainda no papel
  if (rec.pct_confirmada < T.pct_confirmada.media && rec.prevista > 0) {
    out.push({
      codigo:    'D_PREVISTA_PESADA',
      texto:     `${fmtBRL(rec.prevista)} do que você faturou este ano ainda não caiu — é ${fmtPct(100 - rec.pct_confirmada, 0)} em forma de promessa. Enquanto não vira dinheiro, não paga boleto.`,
      gravidade: rec.pct_confirmada < T.pct_confirmada.baixa ? 'critico' : 'atencao',
      dimensao:  'financeira',
    })
  }

  // Receita do ano praticamente no bolso (positivo)
  if (rec.pct_confirmada >= T.pct_confirmada.alta && rec.confirmada > 0) {
    out.push({
      codigo:    'D_CONFIRMADA_FORTE',
      texto:     `${fmtPct(rec.pct_confirmada, 0)} de tudo que você faturou este ano já caiu na conta (${fmtBRL(rec.confirmada)}). Seus clientes honram o que combinam.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  // Queda dupla
  if (rec.mom_pct <= -T.crescimento.queda && rec.yoy_pct <= -T.crescimento.queda) {
    out.push({
      codigo:    'D_QUEDA_DUPLA',
      texto:     `Receita caindo em duas frentes: ${fmtPct(Math.abs(rec.mom_pct), 0)} a menos que mês passado e ${fmtPct(Math.abs(rec.yoy_pct), 0)} a menos que há um ano. Não espera mais um mês pra reagir.`,
      gravidade: 'critico',
      dimensao:  'financeira',
    })
  } else if (rec.mom_pct >= T.crescimento.forte && rec.yoy_pct >= T.crescimento.forte) {
    // Crescimento duplo (positivo)
    out.push({
      codigo:    'D_CRESCIMENTO_DUPLO',
      texto:     `Você cresceu ${fmtPct(rec.mom_pct, 0)} vs mês passado e ${fmtPct(rec.yoy_pct, 0)} vs há um ano. O que você tá fazendo nos últimos meses tá funcionando — identifique e repita.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  // ── COMERCIAIS (inteligência de carteira) ───────────────────────────────

  // Melhor cliente do ano (receita YTD)
  const topYTD = rec.ranking_clientes[0]
  if (topYTD && topYTD.valor > 0) {
    const nomeCli = topYTD.cliente

    // Se concentração crítica, descoberta é negativa (risco)
    if (topYTD.pct >= T.top1_cliente.peso_critico) {
      out.push({
        codigo:    'D_TOP_CLIENTE_CRITICO',
        texto:     `${nomeCli} te pagou ${fmtBRL(topYTD.valor)} este ano — ${fmtPct(topYTD.pct, 0)} de toda sua receita confirmada. Se ele sumir, quase metade do seu ano vai junto.`,
        gravidade: 'critico',
        dimensao:  'comercial',
      })
    } else if (topYTD.pct >= T.top1_cliente.peso_alerta) {
      out.push({
        codigo:    'D_TOP_CLIENTE_ALERTA',
        texto:     `${nomeCli} é seu maior pagador do ano: ${fmtBRL(topYTD.valor)} (${fmtPct(topYTD.pct, 0)} da receita). É seu melhor cliente e, ao mesmo tempo, seu maior risco de concentração.`,
        gravidade: 'atencao',
        dimensao:  'comercial',
      })
    } else if (rec.ranking_clientes.length >= 3) {
      // Base bem distribuída — positivo
      out.push({
        codigo:    'D_TOP_CLIENTE_SAUDAVEL',
        texto:     `Seu maior pagador do ano, ${nomeCli}, representa ${fmtPct(topYTD.pct, 0)} da receita (${fmtBRL(topYTD.valor)}). Nenhum cliente te domina — isso te deixa livre pra escolher.`,
        gravidade: 'positivo',
        dimensao:  'comercial',
      })
    }
  }

  // Cliente que fatura mas deixa pouca margem (cruza ranking receita ↔ margem do agregador Clientes)
  if (rec.ranking_clientes.length >= 2 && cli.ranking_receita.length >= 2) {
    const cruzado = rec.ranking_clientes
      .map(r => {
        const mc = cli.ranking_receita.find(
          c => c.cliente.trim().toLowerCase() === r.cliente.trim().toLowerCase()
        )
        return mc ? { cliente: r.cliente, valor: r.valor, pct: r.pct, margem: mc.margem_pct } : null
      })
      .filter((x): x is { cliente: string; valor: number; pct: number; margem: number } => x !== null)

    const problematico = cruzado.find(c => c.pct >= 15 && c.margem < 15)
    if (problematico) {
      out.push({
        codigo:    'D_CLIENTE_BOM_PAGADOR_RUIM',
        texto:     `${problematico.cliente} te rende ${fmtBRL(problematico.valor)} (${fmtPct(problematico.pct, 0)} da receita) mas deixa só ${fmtPct(problematico.margem, 0)} de margem. Muito faturamento, pouco lucro — hora de revisar o preço com ele.`,
        gravidade: 'atencao',
        dimensao:  'comercial',
      })
    }
  }

  // Ticket médio — referência pra planejar
  if (rec.ticket_medio > 0) {
    out.push({
      codigo:    'D_TICKET_MEDIO',
      texto:     `Cada job seu rende, em média, ${fmtBRL(rec.ticket_medio)}. Use isso como régua: pra fechar R$ 10 mil de receita, você precisa fechar ${Math.max(1, Math.ceil(10000 / rec.ticket_medio))} jobs desse tamanho.`,
      gravidade: 'positivo',
      dimensao:  'comercial',
    })
  }

  return ordenaPorGravidade(out).slice(0, MAX_DESCOBERTAS)
}

// ─── N2 · Sublabels ──────────────────────────────────────────────────────────

function buildSublabels(ctx: Ctx): Record<string, Sublabel> {
  const { rec } = ctx

  return {
    receita_mes: {
      label:    'Receita do mês',
      sublabel: 'Dinheiro que realmente caiu na conta este mês — não é promessa, é saldo',
      trend:    rec.mom_pct !== 0 ? `${fmtDelta(rec.mom_pct)} vs mês passado` : undefined,
    },

    receita_ytd: {
      label:    'Receita no ano',
      sublabel: 'Tudo que caiu na conta desde janeiro · soma do que os clientes efetivamente pagaram',
    },

    confirmada: {
      label:    'Dinheiro no bolso',
      sublabel: 'Parte da receita do ano que já foi paga e tá disponível · é sua de verdade',
    },

    prevista: {
      label:    'Ainda prometido',
      sublabel: 'Jobs já fechados, mas o cliente ainda não pagou · só vira dinheiro quando a transferência cair',
    },

    pct_confirmada: {
      label:    '% já recebida',
      sublabel: rec.pct_confirmada >= T.pct_confirmada.alta
        ? `${fmtPct(rec.pct_confirmada, 0)} do que você faturou este ano já virou dinheiro — acima de 70% é sinal de cliente pagando em dia`
        : rec.pct_confirmada >= T.pct_confirmada.media
          ? `${fmtPct(rec.pct_confirmada, 0)} do faturamento virou dinheiro · o resto ainda depende de cobrança`
          : `Só ${fmtPct(rec.pct_confirmada, 0)} do que você faturou caiu de verdade — maior parte ainda é promessa`,
    },

    ticket_medio: {
      label:    'Valor médio por job',
      sublabel: 'Em média, quanto cada job seu vale · serve de régua pra calcular quantos jobs você precisa fechar por mês',
    },

    proximas_entradas: {
      label:    'O que tá a caminho',
      sublabel: 'Dinheiro prometido com data marcada · dividido por 30, 60 e 90 dias pra você planejar o caixa',
    },

    mom_pct: {
      label:    'Variação vs mês passado',
      sublabel: rec.mom_pct === 0
        ? 'Sem mês anterior pra comparar'
        : rec.mom_pct > 0
          ? `Você faturou ${fmtPct(rec.mom_pct, 0)} a mais que no mês passado`
          : `Você faturou ${fmtPct(Math.abs(rec.mom_pct), 0)} a menos que no mês passado`,
    },

    yoy_pct: {
      label:    'Variação vs há um ano',
      sublabel: rec.yoy_pct === 0
        ? 'Sem dado do mesmo mês do ano passado'
        : rec.yoy_pct > 0
          ? `Este mês foi ${fmtPct(rec.yoy_pct, 0)} maior que o mesmo mês do ano passado`
          : `Este mês foi ${fmtPct(Math.abs(rec.yoy_pct), 0)} menor que o mesmo mês do ano passado`,
    },

    ranking_clientes: {
      label:    'Quem mais te paga',
      sublabel: 'Clientes ordenados pelo total já recebido no ano · olhe se tem alguém pesando demais',
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa completa da aba Receita & Recebimentos.
 * Pura. Lê ReceitaData + ClientesData (pra cruzar margem com top pagadores).
 */
export function calcNarrativaReceita(
  receita:  ReceitaData,
  clientes: ClientesData
): AbaNarrativa {
  const ctx: Ctx = { rec: receita, cli: clientes }

  return {
    veredicto:   buildVeredicto(ctx),
    leitura:     buildLeitura(ctx),
    descobertas: buildDescobertas(ctx),
    sublabels:   buildSublabels(ctx),
  }
}
