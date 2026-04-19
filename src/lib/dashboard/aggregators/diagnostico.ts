// ─── Agregador: Diagnóstico (Aba 6 do Dashboard Executivo) ────────────────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch. Sem recalcular nada.
// Consome os outputs dos 5 agregadores anteriores e INTERPRETA.
//
// DIRETRIZ CRÍTICA:
//   Esta aba NÃO é uma lista de frases bonitas.
//   Ela responde, em 3 perguntas:
//     1. "O que está bom?"          → pontos_positivos[]
//     2. "O que está perigoso?"     → alertas[] + criticos[]
//     3. "O que eu faço agora?"     → acoes[] (até 3, priorizadas)
//
// REGRAS DE TEXTO (obrigatórias — leia antes de editar qualquer `descricao`):
//   · Direto. Claro. Sem jargão.
//   · Sempre com NÚMERO concreto. Nunca "sua concentração está elevada".
//     Sempre "Ele representa 42% da sua receita."
//   · Explica o motivo, não só o fato.
//   · Uma regra, uma mensagem. Nada de 2 insights dizendo a mesma coisa.
//
// EXECUÇÃO:
//   · Thresholds centralizados em `T` (fácil de calibrar depois).
//   · Códigos estáveis nos itens (`P_`, `A_`, `C_`) → UI/analytics podem
//     referenciar sem depender do texto.
//   · Ordem de itens é determinística (ordem das regras).
//   · Ações: engine de prioridade (1 = caixa, 2 = estrutural, 3 = melhoria),
//     corta em 3.

import type { InadimplenciaData } from './inadimplencia'
import type { VisaoGeralData }    from './visao-geral'
import type { ReceitaData }       from './receita'
import type { CustosData }        from './custos'
import type { ClientesData }      from './clientes'

// ─── Saída ────────────────────────────────────────────────────────────────────

export type DiagnosticoTipo = 'positivo' | 'alerta' | 'critico'
export type Horizonte       = 'agora' | 'curto_prazo' | 'medio_prazo'

export interface DiagnosticoItem {
  tipo:       DiagnosticoTipo
  codigo:     string          // estável — ex: 'C_TOP1_CRITICO'
  titulo:     string          // headline curta
  descricao:  string          // texto com número concreto
}

export interface AcaoRecomendada {
  titulo:     string
  descricao:  string
  prioridade: 1 | 2 | 3       // 1 caixa/inadimplência · 2 estrutural · 3 melhoria
  horizonte:  Horizonte
}

export interface DiagnosticoData {
  pontos_positivos: DiagnosticoItem[]
  alertas:          DiagnosticoItem[]
  criticos:         DiagnosticoItem[]
  acoes:            AcaoRecomendada[]
}

// ─── Thresholds (única fonte de verdade — calibrar aqui) ─────────────────────
//
// IMPORTANTE sobre unidades:
//   · health_score:       0–100
//   · runway_meses:       meses (proxy)
//   · pct_confirmada:     percentual (ex: 70 = 70%)
//   · taxa_inadimplencia: percentual (ex: 15 = 15%)
//   · top1_pct, hhi:      percentual e índice 0–10.000
//   · custo_receita_ratio: RATIO decimal (ex: 0.8 = 80%) — vem de custos.ts

const T = {
  health: {
    forte:    70,
    atencao:  40,
  },
  runway: {
    ok:       3,
    curto:    2,
  },
  confirmada: {
    alta:     70,
    media:    50,
  },
  inadimplencia: {
    baixa:    10,
    alta:     15,
  },
  top1: {
    diversificado: 30,
    alerta:        30,
    critico:       40,
  },
  hhi: {
    concentrado: 2500,
  },
  custoReceita: {
    alerta:  0.60,    // 60%
    critico: 0.80,    // 80%
  },
  fixos: {
    pesados: 60,      // % do custo total que é fixo
  },
} as const

const MAX_ACOES = 3

// ─── Helpers de formatação (localizados aqui — texto é responsabilidade desta aba)

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    maximumFractionDigits: 0,
  })
}

function fmtPct(n: number, casas = 0): string {
  return `${n.toFixed(casas).replace('.', ',')}%`
}

function fmtMeses(n: number): string {
  const casas = Number.isInteger(n) ? 0 : 1
  const val   = n.toFixed(casas).replace('.', ',')
  return n === 1 ? '1 mês' : `${val} meses`
}

// ─── Contexto (os 5 agregadores num envelope só) ─────────────────────────────

interface Ctx {
  inad:   InadimplenciaData
  visao:  VisaoGeralData
  receita: ReceitaData
  custos: CustosData
  cli:    ClientesData
}

// ─── Regras: POSITIVOS ───────────────────────────────────────────────────────

function positivos(ctx: Ctx): DiagnosticoItem[] {
  const out: DiagnosticoItem[] = []

  // P_HEALTH_FORTE — saúde geral saudável
  if (ctx.visao.health_score >= T.health.forte) {
    out.push({
      tipo:      'positivo',
      codigo:    'P_HEALTH_FORTE',
      titulo:    'Saúde financeira em dia',
      descricao: `Seu score está em ${ctx.visao.health_score} de 100. A operação roda com folga no mês.`,
    })
  }

  // P_RUNWAY_OK — caixa com fôlego
  if (ctx.visao.runway_meses > T.runway.ok) {
    out.push({
      tipo:      'positivo',
      codigo:    'P_RUNWAY_OK',
      titulo:    'Caixa com fôlego',
      descricao: `Sua receita atual cobre o custo por ${fmtMeses(ctx.visao.runway_meses)}. Se a captação travar, dá tempo de reagir.`,
    })
  }

  // P_CONFIRMADA_ALTA — receita do ano já virou dinheiro
  if (ctx.receita.pct_confirmada >= T.confirmada.alta) {
    out.push({
      tipo:      'positivo',
      codigo:    'P_CONFIRMADA_ALTA',
      titulo:    'Receita do ano já no bolso',
      descricao: `${fmtPct(ctx.receita.pct_confirmada, 0)} do que você faturou este ano já foi recebido. O que foi fechado, caiu na conta.`,
    })
  }

  // P_INAD_BAIXA — clientes pagando em dia
  if (ctx.inad.taxa_pct < T.inadimplencia.baixa && ctx.inad.total_em_aberto >= 0) {
    out.push({
      tipo:      'positivo',
      codigo:    'P_INAD_BAIXA',
      titulo:    'Clientes pagando em dia',
      descricao: `Sua taxa de inadimplência é de ${fmtPct(ctx.inad.taxa_pct, 1)}. Carteira vencida praticamente inteira recebida.`,
    })
  }

  // P_DIVERSIFICADO — nenhum cliente pesa demais
  if (ctx.cli.total_clientes >= 3 && ctx.cli.concentracao.top1_pct < T.top1.diversificado) {
    out.push({
      tipo:      'positivo',
      codigo:    'P_DIVERSIFICADO',
      titulo:    'Base de clientes bem distribuída',
      descricao: `Nenhum cliente passa de ${fmtPct(ctx.cli.concentracao.top1_pct, 0)} da sua receita. Perder um não te derruba.`,
    })
  }

  return out
}

// ─── Regras: ALERTAS (amarelo — ainda dá pra consertar) ──────────────────────

function alertas(ctx: Ctx): DiagnosticoItem[] {
  const out: DiagnosticoItem[] = []

  // A_HEALTH_MEDIO — score médio
  if (
    ctx.visao.health_score >= T.health.atencao &&
    ctx.visao.health_score <  T.health.forte
  ) {
    out.push({
      tipo:      'alerta',
      codigo:    'A_HEALTH_MEDIO',
      titulo:    'Operação funciona, mas sem margem',
      descricao: `Seu score está em ${ctx.visao.health_score} de 100. Um imprevisto te aperta.`,
    })
  }

  // A_RUNWAY_CURTO — entre 2 e 3 meses
  if (
    ctx.visao.runway_meses >= T.runway.curto &&
    ctx.visao.runway_meses <= T.runway.ok
  ) {
    out.push({
      tipo:      'alerta',
      codigo:    'A_RUNWAY_CURTO',
      titulo:    'Fôlego de caixa apertado',
      descricao: `Sua receita cobre o custo por ${fmtMeses(ctx.visao.runway_meses)}. Um contrato atrasado e você sente.`,
    })
  }

  // A_CONFIRMADA_MEDIA — metade da receita ainda é promessa
  if (
    ctx.receita.pct_confirmada >= T.confirmada.media &&
    ctx.receita.pct_confirmada <  T.confirmada.alta
  ) {
    out.push({
      tipo:      'alerta',
      codigo:    'A_CONFIRMADA_MEDIA',
      titulo:    'Muita receita ainda no papel',
      descricao: `Só ${fmtPct(ctx.receita.pct_confirmada, 0)} do faturamento do ano virou dinheiro na conta. O resto ainda é promessa — ${fmtBRL(ctx.receita.prevista)} a receber.`,
    })
  }

  // A_TOP1_MEDIO — um cliente começa a pesar
  if (
    ctx.cli.concentracao.top1_pct >= T.top1.alerta &&
    ctx.cli.concentracao.top1_pct <  T.top1.critico
  ) {
    const topName = ctx.cli.ranking_receita[0]?.cliente ?? 'Seu maior cliente'
    out.push({
      tipo:      'alerta',
      codigo:    'A_TOP1_MEDIO',
      titulo:    'Um cliente pesa demais',
      descricao: `${topName} representa ${fmtPct(ctx.cli.concentracao.top1_pct, 0)} da sua receita. Perder ele dói.`,
    })
  }

  // A_CUSTO_ALTO — custo consome 60–80% da receita
  if (
    ctx.custos.custo_receita_ratio >= T.custoReceita.alerta &&
    ctx.custos.custo_receita_ratio <  T.custoReceita.critico
  ) {
    out.push({
      tipo:      'alerta',
      codigo:    'A_CUSTO_ALTO',
      titulo:    'Custo apertando a margem',
      descricao: `Seu custo consome ${fmtPct(ctx.custos.custo_receita_ratio * 100, 0)} da receita do mês. Sobra pouco pra guardar.`,
    })
  }

  return out
}

// ─── Regras: CRÍTICOS (vermelho — risco imediato) ────────────────────────────

function criticos(ctx: Ctx): DiagnosticoItem[] {
  const out: DiagnosticoItem[] = []

  // C_HEALTH_CRITICO — score < 40
  if (ctx.visao.health_score < T.health.atencao) {
    out.push({
      tipo:      'critico',
      codigo:    'C_HEALTH_CRITICO',
      titulo:    'Saúde financeira em zona crítica',
      descricao: `Seu score caiu pra ${ctx.visao.health_score} de 100. Margem, caixa ou inadimplência estão travando a operação.`,
    })
  }

  // C_RUNWAY_CRITICO — < 2 meses
  if (ctx.visao.runway_meses < T.runway.curto && ctx.visao.custo_mes > 0) {
    out.push({
      tipo:      'critico',
      codigo:    'C_RUNWAY_CRITICO',
      titulo:    'Caixa curto demais',
      descricao: `Sua receita do mês cobre só ${fmtMeses(ctx.visao.runway_meses)} de custo. Qualquer atraso vira problema real.`,
    })
  }

  // C_INAD_ALTA — inadimplência >= 15%
  if (ctx.inad.taxa_pct >= T.inadimplencia.alta) {
    out.push({
      tipo:      'critico',
      codigo:    'C_INAD_ALTA',
      titulo:    'Muito cliente devendo',
      descricao: `${fmtPct(ctx.inad.taxa_pct, 1)} da sua carteira vencida está em aberto — ${fmtBRL(ctx.inad.total_em_aberto)} que já deveriam ter caído.`,
    })
  }

  // C_TOP1_CRITICO — dependência crítica
  if (ctx.cli.concentracao.top1_pct >= T.top1.critico) {
    const topName = ctx.cli.ranking_receita[0]?.cliente ?? 'Um cliente'
    out.push({
      tipo:      'critico',
      codigo:    'C_TOP1_CRITICO',
      titulo:    'Você depende demais de um cliente',
      descricao: `${topName} sozinho representa ${fmtPct(ctx.cli.concentracao.top1_pct, 0)} da sua receita. Se ele sair, você tranca.`,
    })
  }

  // C_HHI_ALTO — carteira muito concentrada (independente do top1)
  if (ctx.cli.hhi >= T.hhi.concentrado) {
    out.push({
      tipo:      'critico',
      codigo:    'C_HHI_ALTO',
      titulo:    'Carteira de clientes muito concentrada',
      descricao: `Poucos clientes carregam quase toda sua receita (índice de concentração ${ctx.cli.hhi}). Uma saída compromete a operação.`,
    })
  }

  // C_QUEDA_DUPLA — receita caindo mês e ano
  if (ctx.receita.mom_pct < 0 && ctx.receita.yoy_pct < 0) {
    out.push({
      tipo:      'critico',
      codigo:    'C_QUEDA_DUPLA',
      titulo:    'Receita em queda sustentada',
      descricao: `Você faturou ${fmtPct(Math.abs(ctx.receita.mom_pct), 0)} a menos que o mês passado e ${fmtPct(Math.abs(ctx.receita.yoy_pct), 0)} a menos que há um ano. Não é oscilação — é tendência.`,
    })
  }

  // C_CUSTO_CRITICO — custo >= 80% da receita
  if (ctx.custos.custo_receita_ratio >= T.custoReceita.critico) {
    out.push({
      tipo:      'critico',
      codigo:    'C_CUSTO_CRITICO',
      titulo:    'Custo quase engolindo a receita',
      descricao: `${fmtPct(ctx.custos.custo_receita_ratio * 100, 0)} da receita do mês vai embora em custo. Praticamente não sobra nada.`,
    })
  }

  return out
}

// ─── Engine de ações (máx 3, priorizadas) ────────────────────────────────────
//
// Cada candidato tem um `trigger`. Só entra se disparar. `prioridade` define o
// bucket (1=caixa, 2=estrutural, 3=melhoria). Dentro do bucket, `ordem`
// desempata. Ordenamos: prioridade ASC, ordem ASC. Corta em MAX_ACOES.

interface AcaoCandidata extends AcaoRecomendada {
  trigger: boolean
  ordem:   number
}

function buildAcoes(ctx: Ctx): AcaoRecomendada[] {
  const candidatas: AcaoCandidata[] = []

  // ── PRIORIDADE 1 — CAIXA / INADIMPLÊNCIA (risco imediato) ──────────────

  // 1.1 Cobrar devedores — só se tem devedor concreto
  const pior = ctx.inad.top_devedores[0]
  if (pior && pior.valor > 0) {
    candidatas.push({
      trigger:    true,
      prioridade: 1,
      ordem:      1,
      horizonte:  'agora',
      titulo:     `Cobrar ${pior.cliente} hoje`,
      descricao:  `${pior.cliente} deve ${fmtBRL(pior.valor)} há ${pior.dias_atraso} dias. Esse dinheiro já é seu — mande a régua de cobrança agora.`,
    })
  }

  // 1.2 Converter receita prevista em recebida
  if (ctx.receita.prevista > 0 && ctx.receita.pct_confirmada < T.confirmada.alta) {
    candidatas.push({
      trigger:    true,
      prioridade: 1,
      ordem:      2,
      horizonte:  'agora',
      titulo:     'Puxar a receita prevista pra conta',
      descricao:  `Você tem ${fmtBRL(ctx.receita.prevista)} a receber. Antecipe cobrança nos que já venceram e confirme data dos próximos.`,
    })
  }

  // 1.3 Cortar custo urgente — runway crítico OU custo engolindo receita
  if (
    (ctx.visao.runway_meses < T.runway.curto && ctx.visao.custo_mes > 0) ||
    ctx.custos.custo_receita_ratio >= T.custoReceita.critico
  ) {
    const top = ctx.custos.top_despesas[0]
    const hint = top
      ? ` Comece pela maior despesa do mês (${top.descricao}, ${fmtBRL(top.valor)}).`
      : ''
    candidatas.push({
      trigger:    true,
      prioridade: 1,
      ordem:      3,
      horizonte:  'agora',
      titulo:     'Cortar custo agora, antes que estoure',
      descricao:  `O custo está no limite da receita. Revise os maiores itens do mês e corte o que não é essencial.${hint}`,
    })
  }

  // ── PRIORIDADE 2 — ESTRUTURAL (clientes / custo fixo) ──────────────────

  // 2.1 Diversificar base — concentração alta
  if (
    ctx.cli.concentracao.top1_pct >= T.top1.critico ||
    ctx.cli.hhi >= T.hhi.concentrado
  ) {
    const topName = ctx.cli.ranking_receita[0]?.cliente ?? 'seu maior cliente'
    candidatas.push({
      trigger:    true,
      prioridade: 2,
      ordem:      1,
      horizonte:  'curto_prazo',
      titulo:     'Buscar clientes novos pra sair da dependência',
      descricao:  `${topName} representa ${fmtPct(ctx.cli.concentracao.top1_pct, 0)} da sua receita. Abra 2–3 frentes novas nos próximos 60 dias.`,
    })
  }

  // 2.2 Reduzir custo fixo — fixos pesam e margem aperta
  if (
    ctx.custos.fixos_pct >= T.fixos.pesados &&
    ctx.custos.custo_receita_ratio >= T.custoReceita.alerta
  ) {
    candidatas.push({
      trigger:    true,
      prioridade: 2,
      ordem:      2,
      horizonte:  'curto_prazo',
      titulo:     'Revisar custo fixo mensal',
      descricao:  `${fmtPct(ctx.custos.fixos_pct, 0)} do seu custo é fixo (${fmtBRL(ctx.custos.fixos_mes)}/mês). Cada corte aqui vira caixa todo mês — não só uma vez.`,
    })
  }

  // ── PRIORIDADE 3 — MELHORIA (eficiência / crescimento) ─────────────────

  // 3.1 Reativar captação — zero cliente novo no mês
  if (ctx.cli.novos_vs_recorrentes.novos === 0 && ctx.cli.total_clientes > 0) {
    candidatas.push({
      trigger:    true,
      prioridade: 3,
      ordem:      1,
      horizonte:  'medio_prazo',
      titulo:     'Voltar a captar clientes novos',
      descricao:  `Você não fechou nenhum cliente novo este mês. Sem entrada nova, a receita vive de quem já tem — e concentração só sobe.`,
    })
  }

  // 3.2 Revisar precificação — top cliente com margem baixa
  const topRanking = ctx.cli.ranking_receita[0]
  if (topRanking && topRanking.margem_pct < 20 && topRanking.receita > 0) {
    candidatas.push({
      trigger:    true,
      prioridade: 3,
      ordem:      2,
      horizonte:  'medio_prazo',
      titulo:     `Repactuar preço com ${topRanking.cliente}`,
      descricao:  `Seu maior cliente rende margem de só ${fmtPct(topRanking.margem_pct, 0)}. É quem mais fatura, mas não é quem mais sobra. Renegocie.`,
    })
  }

  return candidatas
    .filter(a => a.trigger)
    .sort((a, b) => a.prioridade - b.prioridade || a.ordem - b.ordem)
    .slice(0, MAX_ACOES)
    .map(({ trigger, ordem, ...rest }) => {      // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    })
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula o diagnóstico do mês a partir dos 5 agregadores já computados.
 *
 * Função pura. Não faz fetch. Não recalcula nada — apenas lê e interpreta.
 *
 * @param inadimplencia Output de calcInadimplencia()
 * @param visaoGeral    Output de calcVisaoGeral()
 * @param receita       Output de calcReceita()
 * @param custos        Output de calcCustos()
 * @param clientes      Output de calcClientes()
 */
export function calcDiagnostico(
  inadimplencia: InadimplenciaData,
  visaoGeral:    VisaoGeralData,
  receita:       ReceitaData,
  custos:        CustosData,
  clientes:      ClientesData
): DiagnosticoData {
  const ctx: Ctx = {
    inad:    inadimplencia,
    visao:   visaoGeral,
    receita,
    custos,
    cli:     clientes,
  }

  return {
    pontos_positivos: positivos(ctx),
    alertas:          alertas(ctx),
    criticos:         criticos(ctx),
    acoes:            buildAcoes(ctx),
  }
}
