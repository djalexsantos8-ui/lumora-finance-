// ─── Narrativa · Aba Diagnóstico ─────────────────────────────────────────────
//
// META-aba. O Diagnóstico já vem com texto (positivos/alertas/críticos/ações).
// Esta camada NÃO reescreve os itens — ela EMBRULHA tudo numa voz humana:
//
//   · VEREDICTO   — "Tá bem, tá mal ou tá crítico?" em uma linha
//   · LEITURA     — parágrafo que dá sentido ao conjunto (não repete item a item)
//   · DESCOBERTAS — mistura positivos/alertas/críticos num único feed,
//                   convertendo a taxonomia do Diagnóstico (positivo/alerta/crítico)
//                   pra taxonomia da narrativa (positivo/atenção/crítico).
//   · SUBLABELS   — explica o que cada seção significa e como interpretar.
//
// Pergunta que essa aba responde:
//   "No agregado, o que tá acontecendo com a minha operação este mês?"

import type { DiagnosticoData, DiagnosticoItem } from '../../aggregators/diagnostico'

import {
  ordenaPorGravidade,
  type AbaNarrativa,
  type Veredicto,
  type Leitura,
  type Descoberta,
  type Sublabel,
  type Tom,
} from '../types'

const MAX_DESCOBERTAS = 5

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converte a taxonomia do Diagnóstico (positivo/alerta/critico) pra Tom da
 * narrativa (positivo/atenção/crítico). "alerta" vira "atencao".
 */
function tipoToTom(tipo: DiagnosticoItem['tipo']): Tom {
  if (tipo === 'critico')  return 'critico'
  if (tipo === 'alerta')   return 'atencao'
  return 'positivo'
}

/**
 * Infere dimensão (financeira/comercial) a partir do código do item.
 * Códigos começam com prefixos temáticos: TOP1, HHI, CLIENTE → comercial; resto → financeira.
 */
function inferDimensao(codigo: string): 'financeira' | 'comercial' {
  const up = codigo.toUpperCase()
  if (up.includes('TOP1') || up.includes('HHI') || up.includes('CLIENTE') || up.includes('DIVERSIFICADO')) {
    return 'comercial'
  }
  return 'financeira'
}

// ─── N1 · Veredicto ──────────────────────────────────────────────────────────

function buildVeredicto(diag: DiagnosticoData): Veredicto {
  const pergunta = 'No geral, como tá o mês da sua operação?'
  const cPos = diag.pontos_positivos.length
  const cAle = diag.alertas.length
  const cCri = diag.criticos.length

  // Nada a reportar (raro — sem regras disparando em nenhum lado)
  if (cPos + cAle + cCri === 0) {
    return {
      pergunta,
      tese:    'Sem leitura clara.',
      nuance:  'Os dados do mês ainda não acionam nenhuma regra — provavelmente há pouco movimento registrado.',
      prova:   '0 sinais',
      tom:     'atencao',
    }
  }

  const provaBase = `${cCri} crítico${cCri === 1 ? '' : 's'} · ${cAle} alerta${cAle === 1 ? '' : 's'} · ${cPos} ponto${cPos === 1 ? '' : 's'} forte${cPos === 1 ? '' : 's'}`

  // CRÍTICO — tem item(s) vermelho
  if (cCri > 0) {
    return {
      pergunta,
      tese:    cCri === 1 ? 'Tem um problema sério.' : 'Tem problemas sérios.',
      nuance:  cCri === 1
        ? `${cCri} sinal crítico precisa virar prioridade hoje${cAle > 0 ? `, e mais ${cAle} alerta${cAle === 1 ? '' : 's'} na fila` : ''}.`
        : `${cCri} sinais críticos simultâneos — cada um merece atenção imediata${cAle > 0 ? `. Fora os ${cAle} alerta${cAle === 1 ? '' : 's'} em segundo plano.` : '.'}`,
      prova:   provaBase,
      tom:     'critico',
    }
  }

  // ATENÇÃO — só alertas
  if (cAle > 0) {
    return {
      pergunta,
      tese:    'Operando, mas com atenção.',
      nuance:  `${cAle} alerta${cAle === 1 ? '' : 's'} amarelo${cAle === 1 ? '' : 's'} na operação — nada que tranque o mês, mas todos merecem tratamento antes de virarem problema.`,
      prova:   provaBase,
      tom:     'atencao',
    }
  }

  // POSITIVO — só coisa boa
  return {
    pergunta,
    tese:    'Mês saudável.',
    nuance:  cPos >= 3
      ? `${cPos} sinais positivos disparados e zero alerta. Sua operação tá redonda este mês.`
      : `Nenhum sinal de alerta e ${cPos} ponto${cPos === 1 ? ' forte' : 's fortes'} reconhecido${cPos === 1 ? '' : 's'}. Continue no ritmo.`,
    prova:   provaBase,
    tom:     'positivo',
  }
}

// ─── N4 · Leitura ────────────────────────────────────────────────────────────

function buildLeitura(diag: DiagnosticoData): Leitura {
  const frases: string[] = []
  const cPos = diag.pontos_positivos.length
  const cAle = diag.alertas.length
  const cCri = diag.criticos.length

  // Frase 1 — foto agregada
  if (cCri === 0 && cAle === 0 && cPos === 0) {
    frases.push('Sem dados suficientes pra diagnóstico completo este mês — poucos eventos registrados.')
  } else if (cCri > 0) {
    const tituloPrincipal = diag.criticos[0].titulo.toLowerCase()
    frases.push(
      `O sinal mais importante este mês é crítico: "${tituloPrincipal}"${cCri > 1 ? `, junto com mais ${cCri - 1} ponto${cCri - 1 === 1 ? '' : 's'} vermelho${cCri - 1 === 1 ? '' : 's'}` : ''}. Isso precisa virar prioridade nas próximas horas, não semanas.`
    )
  } else if (cAle > 0) {
    frases.push(
      `Sua operação tá funcionando, mas com ${cAle} ponto${cAle === 1 ? '' : 's'} amarelo${cAle === 1 ? '' : 's'} que pedem atenção — nenhum quebra o mês sozinho, mas juntos apertam a margem.`
    )
  } else {
    frases.push(
      `${cPos} sinais positivos disparados, zero alerta: um mês em que a estrutura tá sustentando a operação.`
    )
  }

  // Frase 2 — pontos positivos (contexto, não lista)
  if (cPos > 0 && (cCri > 0 || cAle > 0)) {
    frases.push(
      `Do lado bom, você tem ${cPos} ${cPos === 1 ? 'coisa funcionando' : 'coisas funcionando'} — são elas que estão segurando o resto.`
    )
  }

  // Frase 3 — ações sugeridas (ponte pro que fazer)
  if (diag.acoes.length > 0) {
    const primeira = diag.acoes[0]
    frases.push(
      `Se for fazer uma coisa hoje, faça essa: ${primeira.titulo.toLowerCase()}. É a ação de maior retorno por esforço agora.`
    )
  } else if (cCri === 0 && cAle === 0) {
    frases.push(
      `Sem ações urgentes nesta leitura — o papel agora é manter o que tá funcionando e monitorar o mês.`
    )
  }

  const paragrafo = frases.join(' ')
  const tom: Tom = cCri > 0 ? 'critico' : cAle > 0 ? 'atencao' : 'positivo'

  return { paragrafo, tom }
}

// ─── N3 · Descobertas (converte itens do Diagnóstico em formato narrativa) ──

function buildDescobertas(diag: DiagnosticoData): Descoberta[] {
  // Junta os três baldes num só stream, preservando a taxonomia original.
  const all: DiagnosticoItem[] = [
    ...diag.criticos,
    ...diag.alertas,
    ...diag.pontos_positivos,
  ]

  const descobertas: Descoberta[] = all.map(item => ({
    codigo:    item.codigo,
    texto:     `${item.titulo}: ${item.descricao}`,
    gravidade: tipoToTom(item.tipo),
    dimensao:  inferDimensao(item.codigo),
  }))

  return ordenaPorGravidade(descobertas).slice(0, MAX_DESCOBERTAS)
}

// ─── N2 · Sublabels ──────────────────────────────────────────────────────────

function buildSublabels(): Record<string, Sublabel> {
  return {
    pontos_positivos: {
      label:    'O que tá funcionando',
      sublabel: 'Sinais verdes disparados pelas regras · são esses que sustentam a operação quando outras coisas falham',
    },

    alertas: {
      label:    'O que pede atenção',
      sublabel: 'Sinais amarelos · ainda dá tempo de consertar antes que virem problema real',
    },

    criticos: {
      label:    'O que precisa virar prioridade hoje',
      sublabel: 'Sinais vermelhos · risco imediato, trate antes de qualquer outra coisa no mês',
    },

    acoes: {
      label:    'O que fazer primeiro',
      sublabel: 'Até 3 ações priorizadas · a ordem já considera onde tem maior retorno por esforço',
    },
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Narrativa da aba Diagnóstico.
 *
 * Meta-aba: embrulha DiagnosticoData numa voz humana sem reescrever os itens.
 * Os itens originais são convertidos pro formato Descoberta (preservando
 * texto original), e o veredicto/leitura dá sentido ao CONJUNTO de sinais.
 */
export function calcNarrativaDiagnostico(
  diagnostico: DiagnosticoData
): AbaNarrativa {
  return {
    veredicto:   buildVeredicto(diagnostico),
    leitura:     buildLeitura(diagnostico),
    descobertas: buildDescobertas(diagnostico),
    sublabels:   buildSublabels(),
  }
}
