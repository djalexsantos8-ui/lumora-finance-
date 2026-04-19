// ─── Narrativa · Aba Inadimplência ───────────────────────────────────────────
//
// Transforma InadimplenciaData em narrativa humana.
//
// Pergunta que essa aba responde: "Quem tá te devendo agora?"
//
// ZERO jargão. Traduções aplicadas:
//   aging             → "atraso de X dias"
//   taxa_pct          → "de tudo que já venceu, X% ainda não caiu"
//   pmr_dias          → "em média, seus clientes atrasam X dias"
//   provisão sugerida → "estimativa do que provavelmente nunca vai cair"

import type { InadimplenciaData } from '../../aggregators/inadimplencia'
import type { VisaoGeralData }    from '../../aggregators/visao-geral'

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
  taxa: {
    baixa: 5,     // < 5%  = praticamente ninguém
    media: 10,    // 5-10% = uns poucos
    alta:  15,    // >=15% = muita gente devendo
  },
  pmr: {
    normal:    7,     // até 7 dias de atraso médio = dentro do aceitável
    incomodo:  15,    // 15 dias já é sinal
    critico:   30,    // mais de 30 = padrão ruim
  },
} as const

const MAX_DESCOBERTAS = 5

// ─── Contexto ────────────────────────────────────────────────────────────────

interface Ctx {
  inad:  InadimplenciaData
  visao: VisaoGeralData
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────

function buildVeredicto(ctx: Ctx): Veredicto {
  const { inad } = ctx
  const pergunta = 'Quem tá te devendo agora?'
  const provaBase = `${fmtBRL(inad.total_em_aberto)} em aberto · ${fmtPct(inad.taxa_pct, 1)} da carteira vencida`

  // Nada em aberto
  if (inad.total_em_aberto === 0) {
    return {
      pergunta,
      tese:    'Ninguém.',
      nuance:  'Todo mundo que já venceu, pagou. Carteira limpa.',
      prova:   'R$ 0 em atraso',
      tom:     'positivo',
    }
  }

  // CRÍTICO — tem dívida velha (> 90 dias)
  if (inad.aging.d90_mais > 0) {
    const piorAntigo = inad.top_devedores.find(d => d.dias_atraso > 90)
    const nomePior = piorAntigo?.cliente ?? 'Um cliente'
    return {
      pergunta,
      tese:    'Sim — e dívida velha.',
      nuance:  `${nomePior} te deve há mais de 3 meses. Quanto mais tempo passa, menos chance de cair.`,
      prova:   `${fmtBRL(inad.aging.d90_mais)} parado há 90+ dias · total ${fmtBRL(inad.total_em_aberto)}`,
      tom:     'critico',
    }
  }

  // CRÍTICO — taxa alta
  if (inad.taxa_pct >= T.taxa.alta) {
    return {
      pergunta,
      tese:    'Muita gente.',
      nuance:  `De tudo que já venceu, ${fmtPct(inad.taxa_pct, 1)} ainda tá em aberto. Bastante cliente atrasado ao mesmo tempo.`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // ATENÇÃO — taxa média
  if (inad.taxa_pct >= T.taxa.media) {
    return {
      pergunta,
      tese:    'Alguns clientes.',
      nuance:  `${fmtPct(inad.taxa_pct, 1)} da carteira vencida ainda não caiu. Dá pra zerar com uma boa rodada de cobrança.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // ATENÇÃO — PMR alto mesmo com taxa baixa
  if (inad.pmr_dias >= T.pmr.critico) {
    return {
      pergunta,
      tese:    'Poucos — mas pagando tarde.',
      nuance:  `Seus clientes atrasam em média ${inad.pmr_dias} dias depois do prazo. O dinheiro entra, mas entra mais tarde do que devia.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // POSITIVO — taxa baixa
  if (inad.taxa_pct < T.taxa.baixa) {
    return {
      pergunta,
      tese:    'Quase ninguém.',
      nuance:  `Só ${fmtPct(inad.taxa_pct, 1)} da carteira vencida tá em aberto — seus clientes pagam em dia.`,
      prova:   provaBase,
      tom:     'positivo',
    }
  }

  // POSITIVO genérico
  return {
    pergunta,
    tese:    'Poucos.',
    nuance:  'Alguma coisa em aberto, mas nada que comprometa o mês.',
    prova:   provaBase,
    tom:     'positivo',
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────

function buildLeitura(ctx: Ctx): Leitura {
  const { inad, visao } = ctx
  const frases: string[] = []

  // Frase 1 — o que tem em aberto
  if (inad.total_em_aberto === 0) {
    frases.push('Ninguém tá te devendo agora — todos os jobs com prazo já vencido foram pagos.')
  } else {
    frases.push(
      `Tem ${fmtBRL(inad.total_em_aberto)} em aberto de clientes que já deveriam ter pagado.` +
      ` Isso representa ${fmtPct(inad.taxa_pct, 1)} de tudo que já venceu.`
    )
  }

  // Frase 2 — aging (o que preocupa)
  if (inad.aging.d90_mais > 0) {
    frases.push(
      `Desse valor, ${fmtBRL(inad.aging.d90_mais)} tá parado há mais de 3 meses — essa parte tem alta chance de nunca cair.`
    )
  } else if (inad.aging.d61_90 > 0) {
    frases.push(
      `${fmtBRL(inad.aging.d61_90)} desse total tá em atraso entre 2 e 3 meses — ainda dá pra cobrar, mas tá ficando velho.`
    )
  }

  // Frase 3 — PMR (comportamento de pagamento)
  if (inad.pmr_dias >= T.pmr.incomodo) {
    frases.push(
      `Seus clientes, em média, pagam ${inad.pmr_dias} dias depois do prazo combinado — dinheiro seu preso no cliente.`
    )
  } else if (inad.pmr_dias <= 0 && inad.pmr_dias > -T.pmr.incomodo) {
    frases.push(
      `Em média, seus clientes pagam no prazo — bom sinal de relação saudável.`
    )
  }

  // Frase 4 — impacto no caixa (se dívida comparável à receita do mês)
  if (visao.receita_mes > 0 && inad.total_em_aberto >= visao.receita_mes * 0.5) {
    frases.push(
      `Pra você ter uma dimensão: esse valor em aberto equivale a mais da metade da sua receita deste mês.`
    )
  }

  const paragrafo = frases.join(' ')
  const tom: Tom =
      inad.aging.d90_mais > 0 || inad.taxa_pct >= T.taxa.alta ? 'critico'
    : inad.taxa_pct >= T.taxa.media || inad.pmr_dias >= T.pmr.critico ? 'atencao'
    : 'positivo'

  return { paragrafo, tom }
}

// ─── N3 · Descobertas ────────────────────────────────────────────────────────

function buildDescobertas(ctx: Ctx): Descoberta[] {
  const { inad } = ctx
  const out: Descoberta[] = []

  // Pior devedor (sempre o primeiro item acionável)
  const pior = inad.top_devedores[0]
  if (pior) {
    const criticidade: Tom = pior.dias_atraso > 90 ? 'critico' : pior.dias_atraso > 60 ? 'atencao' : 'atencao'
    out.push({
      codigo:    'D_PIOR_DEVEDOR',
      texto:     `${pior.cliente} te deve ${fmtBRL(pior.valor)} há ${pior.dias_atraso} dias. Esse é o primeiro que você precisa cobrar.`,
      gravidade: criticidade,
      dimensao:  'comercial',
    })
  }

  // Dívida velha (>90d)
  if (inad.aging.d90_mais > 0) {
    out.push({
      codigo:    'D_DIVIDA_VELHA',
      texto:     `${fmtBRL(inad.aging.d90_mais)} tá parado há mais de 3 meses. Historicamente, uma boa parte desse valor vira prejuízo — cobre agora ou considere perdido.`,
      gravidade: 'critico',
      dimensao:  'financeira',
    })
  }

  // PMR alto = padrão comportamental dos clientes
  if (inad.pmr_dias >= T.pmr.critico) {
    out.push({
      codigo:    'D_PMR_ALTO',
      texto:     `Em média, seus clientes atrasam ${inad.pmr_dias} dias. Mais do que mera inadimplência, isso é um padrão — vale revisar prazos no contrato.`,
      gravidade: 'atencao',
      dimensao:  'comercial',
    })
  } else if (inad.pmr_dias >= T.pmr.incomodo) {
    out.push({
      codigo:    'D_PMR_INCOMODO',
      texto:     `Seus clientes pagam em média ${inad.pmr_dias} dias depois do prazo. Nada crítico, mas é dinheiro seu parado na mão deles.`,
      gravidade: 'atencao',
      dimensao:  'comercial',
    })
  }

  // Provisão sugerida — educação financeira embutida
  if (inad.provisao_sugerida > 0 && inad.total_em_aberto > 0) {
    const pctEstimadoPerda = Math.round((inad.provisao_sugerida / inad.total_em_aberto) * 100)
    out.push({
      codigo:    'D_PROVISAO',
      texto:     `Da dívida total em aberto, a estimativa é que ${fmtBRL(inad.provisao_sugerida)} (${pctEstimadoPerda}%) provavelmente não vai cair. Planeje o mês considerando esse valor como perda.`,
      gravidade: pctEstimadoPerda > 30 ? 'atencao' : 'atencao',
      dimensao:  'financeira',
    })
  }

  // Padrão de atraso concentrado (muitos devedores na mesma faixa)
  if (inad.top_devedores.length >= 3) {
    const mediosPrazos = inad.top_devedores.slice(0, 3).map(d => d.dias_atraso)
    const todosProximos = Math.max(...mediosPrazos) - Math.min(...mediosPrazos) <= 15
    if (todosProximos && mediosPrazos[0] >= 30) {
      out.push({
        codigo:    'D_PADRAO_ATRASO',
        texto:     `Seus 3 maiores devedores estão atrasados em prazos parecidos (todos entre ${Math.min(...mediosPrazos)} e ${Math.max(...mediosPrazos)} dias). Provavelmente todos venceram numa mesma leva — foi uma falha de cobrança coletiva.`,
        gravidade: 'atencao',
        dimensao:  'comercial',
      })
    }
  }

  // Inadimplência quase zero (positivo)
  if (inad.taxa_pct < T.taxa.baixa && inad.total_em_aberto < 1000) {
    out.push({
      codigo:    'D_CARTEIRA_LIMPA',
      texto:     `Sua taxa de inadimplência é de ${fmtPct(inad.taxa_pct, 1)} — basicamente zero. Seus clientes honram o que combinam.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  return ordenaPorGravidade(out).slice(0, MAX_DESCOBERTAS)
}

// ─── N2 · Sublabels ──────────────────────────────────────────────────────────

function buildSublabels(ctx: Ctx): Record<string, Sublabel> {
  const { inad } = ctx

  return {
    total_em_aberto: {
      label:    'Dinheiro em aberto',
      sublabel: 'Tudo que clientes já deveriam ter pago e ainda não pagaram',
    },

    taxa_pct: {
      label:    'Taxa de inadimplência',
      sublabel: 'De tudo que já venceu, quanto ainda não caiu na conta · abaixo de 5% é considerado saudável',
    },

    pmr_dias: {
      label:    'Atraso médio',
      sublabel: inad.pmr_dias >= 0
        ? `Em média, seus clientes pagam ${inad.pmr_dias} dias depois do prazo combinado`
        : `Em média, seus clientes pagam ${Math.abs(inad.pmr_dias)} dias antes do prazo combinado`,
    },

    provisao_sugerida: {
      label:    'Estimativa de perda',
      sublabel: 'Quanto do que tá em aberto provavelmente nunca vai cair, baseado no tempo de atraso · use pra planejar o mês conservadoramente',
    },

    aging: {
      label:    'Distribuição por idade da dívida',
      sublabel: 'Quanto tempo cada pedaço da dívida tá esperando · quanto mais tempo, menor a chance de cair',
    },

    top_devedores: {
      label:    'Quem mais deve',
      sublabel: 'Clientes ordenados do que mais deve pro que menos deve · comece a cobrança pelo topo',
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa completa da aba Inadimplência.
 * Pura. Lê InadimplenciaData + VisaoGeralData (pra contextualizar dívida vs receita).
 */
export function calcNarrativaInadimplencia(
  inadimplencia: InadimplenciaData,
  visaoGeral:    VisaoGeralData
): AbaNarrativa {
  const ctx: Ctx = { inad: inadimplencia, visao: visaoGeral }

  return {
    veredicto:   buildVeredicto(ctx),
    leitura:     buildLeitura(ctx),
    descobertas: buildDescobertas(ctx),
    sublabels:   buildSublabels(ctx),
  }
}
