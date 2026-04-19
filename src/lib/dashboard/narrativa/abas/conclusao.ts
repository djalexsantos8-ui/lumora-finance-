// ─── Narrativa · Aba Conclusão Executiva ─────────────────────────────────────
//
// Aba final. A Conclusão já entrega status_geral + headline + resumo, mas em
// linguagem de executivo. Esta camada TRADUZ pra linguagem de pessoa —
// fotógrafo/filmmaker que quer saber em 10 segundos se dá pra dormir tranquilo.
//
// Pergunta que essa aba responde:
//   "Se eu só tiver 30 segundos, o que preciso saber AGORA?"
//
// Regra sagrada: o usuário bate o olho e entende. Sem buscar em tabela.
// Sem clicar em tooltip. Tudo visível.

import type { ConclusaoData, AbaId }  from '../../aggregators/conclusao'

import {
  type AbaNarrativa,
  type Veredicto,
  type Leitura,
  type Descoberta,
  type Sublabel,
  type Tom,
} from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Traduz status_geral (do agregador) pra Tom (da narrativa).
 */
function statusToTom(status: ConclusaoData['status_geral']): Tom {
  if (status === 'critico')  return 'critico'
  if (status === 'atencao')  return 'atencao'
  return 'positivo'
}

/**
 * Nome humano de cada aba (pra aparecer no texto, não AbaId técnico).
 */
const NOME_ABA: Record<AbaId, string> = {
  inadimplencia: 'Inadimplência',
  visao_geral:   'Visão Geral',
  receita:       'Receita',
  custos:        'Custos',
  clientes:      'Clientes',
  diagnostico:   'Diagnóstico',
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────

function buildVeredicto(conc: ConclusaoData): Veredicto {
  const pergunta = 'Se eu só tiver 30 segundos, o que preciso saber?'

  // A headline do agregador já é uma frase boa e contextual — usamos ela
  // como NUANCE. A tese é o status_geral traduzido em 1 palavra.
  const tese =
      conc.status_geral === 'saudavel' ? 'Tá tudo bem.'
    : conc.status_geral === 'atencao'  ? 'Tá funcionando, com ressalva.'
    :                                    'Tem coisa séria pra resolver.'

  const prova = `${conc.prioridade_abas.length > 0
    ? `Olhe primeiro: ${conc.prioridade_abas.map(p => NOME_ABA[p.aba]).join(' → ')}`
    : 'Olhe: Diagnóstico'}`

  return {
    pergunta,
    tese,
    nuance: conc.headline,
    prova,
    tom:    statusToTom(conc.status_geral),
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────

function buildLeitura(conc: ConclusaoData): Leitura {
  const frases: string[] = []

  // Frase 1 — a headline humana (já vem contextual do agregador)
  frases.push(`${conc.headline}.`)

  // Frase 2 — o que tá bom (positivo do resumo)
  if (conc.resumo.positivo && !conc.resumo.positivo.toLowerCase().startsWith('sem sinais')) {
    frases.push(`Do lado bom: ${conc.resumo.positivo.toLowerCase()}.`)
  }

  // Frase 3 — o risco principal
  if (conc.resumo.risco && !conc.resumo.risco.toLowerCase().startsWith('nenhum risco')) {
    frases.push(`O que preocupa: ${conc.resumo.risco.toLowerCase()}.`)
  }

  // Frase 4 — ação única (ponte pra fazer)
  if (conc.resumo.acao && !conc.resumo.acao.toLowerCase().startsWith('continue acompanhando')) {
    frases.push(`Se for fazer uma coisa hoje, é essa: ${conc.resumo.acao.toLowerCase()}.`)
  }

  // Frase 5 — por onde começar
  if (conc.prioridade_abas.length > 0) {
    const primeira = conc.prioridade_abas[0]
    frases.push(`E pra entender o motivo, abra primeiro a aba ${NOME_ABA[primeira.aba]} — ${primeira.motivo.toLowerCase()}.`)
  }

  const paragrafo = frases.join(' ')

  return {
    paragrafo,
    tom: statusToTom(conc.status_geral),
  }
}

// ─── N3 · Descobertas (converte resumo em fatos concretos) ──────────────────

function buildDescobertas(conc: ConclusaoData): Descoberta[] {
  const out: Descoberta[] = []

  // Risco principal (se houver)
  if (conc.resumo.risco && !conc.resumo.risco.toLowerCase().startsWith('nenhum risco')) {
    out.push({
      codigo:    'D_RISCO_PRINCIPAL',
      texto:     `${conc.resumo.risco}. Este é o ponto que mais pesa na leitura do mês — se resolver ele, muda o tom da operação.`,
      gravidade: conc.status_geral === 'critico' ? 'critico' : 'atencao',
      dimensao:  'financeira',
    })
  }

  // Ação prioritária
  if (conc.resumo.acao && !conc.resumo.acao.toLowerCase().startsWith('continue acompanhando')) {
    out.push({
      codigo:    'D_ACAO_PRIORITARIA',
      texto:     `Ação de maior impacto agora: ${conc.resumo.acao}. Começar por aí libera energia pra resolver o resto.`,
      gravidade: 'atencao',
      dimensao:  'financeira',
    })
  }

  // Ponto positivo (se houver)
  if (conc.resumo.positivo && !conc.resumo.positivo.toLowerCase().startsWith('sem sinais')) {
    out.push({
      codigo:    'D_PONTO_FORTE',
      texto:     `${conc.resumo.positivo}. É o que tá sustentando o mês — proteja isso.`,
      gravidade: 'positivo',
      dimensao:  'financeira',
    })
  }

  // Prioridade de abas (mapeia cada aba prioritária em descoberta)
  for (const p of conc.prioridade_abas) {
    out.push({
      codigo:    `D_OLHE_${p.aba.toUpperCase()}`,
      texto:     `Olhe a aba ${NOME_ABA[p.aba]}: ${p.motivo}.`,
      gravidade: conc.status_geral === 'critico' ? 'atencao' : 'positivo',
      dimensao:  p.aba === 'clientes' || p.aba === 'receita' ? 'comercial' : 'financeira',
    })
  }

  return out.slice(0, 5)
}

// ─── N2 · Sublabels ──────────────────────────────────────────────────────────

function buildSublabels(conc: ConclusaoData): Record<string, Sublabel> {
  return {
    status_geral: {
      label:    'Status do mês',
      sublabel: conc.status_geral === 'saudavel'
        ? 'Operação saudável · nenhum sinal crítico disparado'
        : conc.status_geral === 'atencao'
          ? 'Operação funcional, com pontos amarelos · ainda dá tempo de ajustar'
          : 'Operação com sinais críticos · risco imediato, priorizar hoje',
    },

    headline: {
      label:    'Diagnóstico em uma frase',
      sublabel: 'Resumo contextual do mês · escolhido entre os padrões mais relevantes dos seus dados',
    },

    resumo_positivo: {
      label:    'O que tá funcionando',
      sublabel: 'Ponto forte mais evidente do mês · é o que sustenta a operação',
    },

    resumo_risco: {
      label:    'O que preocupa',
      sublabel: 'Maior risco identificado · o que, se piorar, mais compromete o negócio',
    },

    resumo_acao: {
      label:    'O que fazer primeiro',
      sublabel: 'Ação de maior retorno por esforço · comece por ela e o resto destrava',
    },

    prioridade_abas: {
      label:    'Por onde começar',
      sublabel: 'Abas ordenadas por urgência · siga a ordem pra resolver na sequência certa',
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa da aba Conclusão Executiva.
 *
 * A aba mais "humana" do dashboard — é o resumo que o usuário bate o olho
 * antes de dormir ou no meio do café. Traduz ConclusaoData (que já é
 * resumido) pra linguagem direta de pessoa não-executiva.
 */
export function calcNarrativaConclusao(
  conclusao: ConclusaoData
): AbaNarrativa {
  return {
    veredicto:   buildVeredicto(conclusao),
    leitura:     buildLeitura(conclusao),
    descobertas: buildDescobertas(conclusao),
    sublabels:   buildSublabels(conclusao),
  }
}
