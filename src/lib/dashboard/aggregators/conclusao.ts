// ─── Agregador: Conclusão Executiva (Aba 7 do Dashboard Executivo) ──────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch. Sem recalcular nada.
// Lê os 6 agregadores anteriores e SINTETIZA.
//
// DIRETRIZ CRÍTICA:
//   O usuário precisa bater o olho e entender o negócio em 10 segundos.
//
//   Esta aba responde, em ordem:
//     1. "Eu estou bem ou ferrado?"   → status_geral
//     2. "Em uma frase — o que é?"    → headline
//     3. "O melhor, o pior, o ação"   → resumo { positivo, risco, acao }
//     4. "Pra onde eu olho primeiro?" → prioridade_abas[] (máx 3)
//
// STATUS GERAL:
//   Derivado do DIAGNÓSTICO (não do health_score isolado). Se o diagnóstico
//   disparou qualquer crítico, o usuário não tem como estar "saudável".
//
//     criticos.length > 0  → 'critico'
//     alertas.length  > 0  → 'atencao'
//     senão                 → 'saudavel'
//
// HEADLINE:
//   Uma única frase, contextual (não genérica). Escolhida por padrão-signal
//   — ex: "lucrando, mas dependendo demais de um cliente" é diferente de
//   "seu caixa está em risco imediato".
//
// RESUMO:
//   Puxa da saída do Diagnóstico. Para NÃO duplicar o texto literal, usamos
//   só a PRIMEIRA FRASE do campo `descricao` (antes do primeiro ponto). Dá
//   uma "prévia" do item, não a descrição inteira.
//
//   · positivo → primeiro `pontos_positivos`
//   · risco    → primeiro `criticos` (fallback para primeiro `alerta`)
//   · acao     → `titulo` da primeira `acoes` (titulo já é imperativo curto)
//
// PRIORIDADE DE ABAS:
//   Engine de sinais. Candidatos têm trigger (dispara ou não) + ordem
//   fixa (spec). Corta em 3. Se ninguém dispara, cai no Diagnóstico como
//   fallback — a conclusão nunca manda o usuário pra lugar nenhum.

import type { InadimplenciaData } from './inadimplencia'
import type { VisaoGeralData }    from './visao-geral'
import type { ReceitaData }       from './receita'
import type { CustosData }        from './custos'
import type { ClientesData }      from './clientes'
import type { DiagnosticoData }   from './diagnostico'

// ─── Saída ────────────────────────────────────────────────────────────────────

export type StatusGeral = 'saudavel' | 'atencao' | 'critico'

export type AbaId =
  | 'inadimplencia'
  | 'visao_geral'
  | 'receita'
  | 'custos'
  | 'clientes'
  | 'diagnostico'

export interface ResumoConclusao {
  positivo: string
  risco:    string
  acao:     string
}

export interface PrioridadeAba {
  aba:    AbaId
  motivo: string
}

export interface ConclusaoData {
  status_geral:    StatusGeral
  headline:        string
  resumo:          ResumoConclusao
  prioridade_abas: PrioridadeAba[]
}

// ─── Thresholds (alinhados com diagnostico.ts — mesma fonte de verdade) ─────
//
// Aqui NÃO redefinimos regras — só referenciamos thresholds que já existem
// na narrativa do Diagnóstico para decidir a ordem de prioridade das abas e
// escolher a headline certa.

const T = {
  health: { critico: 40 },
  runway: { curto: 2 },
  inad:   { alerta: 10, alta: 15 },
  top1:   { alerta: 30, critico: 40 },
  hhi:    { concentrado: 2500 },
  ratio:  { alerta: 0.60, critico: 0.80 },
  fixos:  { pesados: 60 },
  pct_confirmada: { baixa: 50 },
  margem_forte: 25,
} as const

const MAX_PRIORIDADES = 3

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Primeira frase de um texto (tudo até o primeiro '.'). Usada no RESUMO pra
 * não duplicar texto integral do Diagnóstico.
 */
function firstSentence(s: string): string {
  if (!s) return ''
  const i = s.indexOf('.')
  return (i > 0 ? s.slice(0, i) : s).trim()
}

// ─── Contexto ────────────────────────────────────────────────────────────────

interface Ctx {
  inad:  InadimplenciaData
  visao: VisaoGeralData
  rec:   ReceitaData
  cus:   CustosData
  cli:   ClientesData
  diag:  DiagnosticoData
}

// ─── Status geral ────────────────────────────────────────────────────────────

function statusGeral(diag: DiagnosticoData): StatusGeral {
  if (diag.criticos.length > 0) return 'critico'
  if (diag.alertas.length  > 0) return 'atencao'
  return 'saudavel'
}

// ─── Headline (1 frase contextual) ───────────────────────────────────────────
//
// Prioridade: testa padrões do MAIS GRAVE/específico para o mais genérico.
// A primeira que bate ganha. Sem "else if" gigante explicitamente por
// legibilidade — retornamos cedo.

function headline(ctx: Ctx, status: StatusGeral): string {
  const { inad, visao, rec, cus, cli } = ctx

  if (status === 'critico') {
    if (visao.runway_meses < T.runway.curto && visao.custo_mes > 0) {
      return 'Seu caixa está em risco imediato'
    }
    if (cus.custo_receita_ratio >= T.ratio.critico) {
      return 'Seu custo está quase engolindo a receita'
    }
    if (cli.concentracao.top1_pct >= T.top1.critico || cli.hhi >= T.hhi.concentrado) {
      return 'Você depende demais de um único cliente'
    }
    if (inad.taxa_pct >= T.inad.alta) {
      return 'Cliente demais devendo pra você aguentar assim'
    }
    if (rec.mom_pct < 0 && rec.yoy_pct < 0) {
      return 'Sua receita está em queda sustentada'
    }
    if (visao.health_score < T.health.critico) {
      return 'Sua operação está no vermelho'
    }
    return 'Existe um risco crítico que precisa virar prioridade hoje'
  }

  if (status === 'atencao') {
    const margemForte  = visao.margem_mes_pct >= T.margem_forte
    const lucrando     = visao.resultado_mes > 0
    const top1Pesado   = cli.concentracao.top1_pct >= T.top1.alerta

    if (margemForte && top1Pesado) {
      return 'Você está lucrando, mas depende demais de um cliente'
    }
    if (lucrando && cus.custo_receita_ratio >= T.ratio.alerta) {
      return 'Você fatura, mas a margem está sumindo'
    }
    if (visao.runway_meses <= 3) {
      return 'Operação em pé, mas com pouco fôlego de caixa'
    }
    if (rec.mom_pct < 0) {
      return 'Operação saudável, mas a receita começou a escorregar'
    }
    return 'Operação funciona, mas sem margem pra errar'
  }

  // saudável
  if (rec.mom_pct > 0 && rec.yoy_pct > 0) {
    return 'Negócio saudável e em crescimento'
  }
  if (visao.margem_mes_pct >= T.margem_forte && visao.resultado_mes > 0) {
    return 'Seu negócio está lucrativo e firme'
  }
  return 'Operação saudável neste mês'
}

// ─── Resumo (positivo / risco / ação) ────────────────────────────────────────

function resumo(diag: DiagnosticoData): ResumoConclusao {
  const positivoItem = diag.pontos_positivos[0]
  const riscoItem    = diag.criticos[0] ?? diag.alertas[0]
  const acaoItem     = diag.acoes[0]

  return {
    positivo: positivoItem
      ? firstSentence(positivoItem.descricao)
      : 'Sem sinais claros de saúde financeira neste mês',
    risco: riscoItem
      ? firstSentence(riscoItem.descricao)
      : 'Nenhum risco relevante detectado pelas regras atuais',
    acao: acaoItem
      ? acaoItem.titulo
      : 'Continue acompanhando os indicadores do mês',
  }
}

// ─── Prioridade de abas (engine) ─────────────────────────────────────────────
//
// Candidatos na ORDEM DA SPEC (inad → visao → cli → cus → rec → diag_fallback).
// Cada um tem um `trigger`; só entra se disparou. Corta em MAX_PRIORIDADES.
// Se ninguém dispara, retornamos diagnóstico como fallback.

interface Candidato {
  aba:     AbaId
  trigger: boolean
  motivo:  string
}

function prioridadeAbas(ctx: Ctx): PrioridadeAba[] {
  const { inad, visao, rec, cus, cli } = ctx

  // 1) INADIMPLÊNCIA — cobrança pendente relevante
  const piorDevedor = inad.top_devedores[0]
  const inadTrigger =
    inad.taxa_pct >= T.inad.alerta ||
    (piorDevedor && piorDevedor.dias_atraso >= 31)

  // 2) VISÃO GERAL — saúde/runway ruim
  const visaoTrigger =
    visao.health_score <  T.health.critico ||
    (visao.runway_meses < T.runway.curto && visao.custo_mes > 0)

  // 3) CLIENTES — concentração alta
  const cliTrigger =
    cli.concentracao.top1_pct >= T.top1.alerta ||
    cli.hhi                    >= T.hhi.concentrado

  // 4) CUSTOS — custo apertado
  const cusTrigger =
    cus.custo_receita_ratio >= T.ratio.critico ||
    (cus.custo_receita_ratio >= T.ratio.alerta && cus.fixos_pct >= T.fixos.pesados)

  // 5) RECEITA — queda ou receita prevista pesada demais
  const recTrigger =
    (rec.mom_pct < 0 && rec.yoy_pct < 0) ||
    rec.pct_confirmada < T.pct_confirmada.baixa

  const candidatos: Candidato[] = [
    {
      aba:     'inadimplencia',
      trigger: Boolean(inadTrigger),
      motivo:  piorDevedor && piorDevedor.dias_atraso >= 31
        ? `${piorDevedor.cliente} atrasado há ${piorDevedor.dias_atraso} dias`
        : `${inad.taxa_pct.toFixed(1).replace('.', ',')}% da carteira vencida em aberto`,
    },
    {
      aba:     'visao_geral',
      trigger: Boolean(visaoTrigger),
      motivo:  visao.health_score < T.health.critico
        ? `Score de saúde em ${visao.health_score} de 100`
        : `Caixa cobre só ${visao.runway_meses.toString().replace('.', ',')} meses de custo`,
    },
    {
      aba:     'clientes',
      trigger: Boolean(cliTrigger),
      motivo:  cli.concentracao.top1_pct >= T.top1.alerta
        ? `Um cliente responde por ${cli.concentracao.top1_pct.toFixed(0)}% da receita`
        : `Carteira concentrada (HHI ${cli.hhi})`,
    },
    {
      aba:     'custos',
      trigger: Boolean(cusTrigger),
      motivo:  cus.custo_receita_ratio >= T.ratio.critico
        ? `Custo consome ${Math.round(cus.custo_receita_ratio * 100)}% da receita`
        : `Custo fixo pesa ${cus.fixos_pct.toFixed(0)}% do total`,
    },
    {
      aba:     'receita',
      trigger: Boolean(recTrigger),
      motivo:  (rec.mom_pct < 0 && rec.yoy_pct < 0)
        ? 'Receita caindo vs mês passado e vs ano passado'
        : `Só ${rec.pct_confirmada.toFixed(0)}% da receita do ano já foi recebida`,
    },
  ]

  const ativas = candidatos
    .filter(c => c.trigger)
    .slice(0, MAX_PRIORIDADES)
    .map(c => ({ aba: c.aba, motivo: c.motivo }))

  if (ativas.length > 0) return ativas

  // Fallback — ninguém triggou. Mandamos o usuário pra visão consolidada.
  return [{ aba: 'diagnostico', motivo: 'Visão consolidada do mês' }]
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Síntese executiva — o veredicto final do dashboard.
 *
 * Função pura. Lê os 6 agregadores anteriores (incluindo Diagnóstico) e
 * devolve a conclusão em formato legível em 10 segundos.
 *
 * @param inadimplencia Output de calcInadimplencia()
 * @param visaoGeral    Output de calcVisaoGeral()
 * @param receita       Output de calcReceita()
 * @param custos        Output de calcCustos()
 * @param clientes      Output de calcClientes()
 * @param diagnostico   Output de calcDiagnostico()
 */
export function calcConclusao(
  inadimplencia: InadimplenciaData,
  visaoGeral:    VisaoGeralData,
  receita:       ReceitaData,
  custos:        CustosData,
  clientes:      ClientesData,
  diagnostico:   DiagnosticoData
): ConclusaoData {
  const ctx: Ctx = {
    inad:  inadimplencia,
    visao: visaoGeral,
    rec:   receita,
    cus:   custos,
    cli:   clientes,
    diag:  diagnostico,
  }

  const status = statusGeral(diagnostico)

  return {
    status_geral:    status,
    headline:        headline(ctx, status),
    resumo:          resumo(diagnostico),
    prioridade_abas: prioridadeAbas(ctx),
  }
}
