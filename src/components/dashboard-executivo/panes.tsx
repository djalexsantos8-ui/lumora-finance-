// ─── Panes · Composição por aba ──────────────────────────────────────────────
//
// Cada aba recebe { agregado, narrativa } e monta:
//
//   1. VeredictoCard    (hero N1 — vem 100% da narrativa)
//   2. Grade de KPIs    (N2 — value formatado do agregado + sublabel da narrativa)
//   3. DescobertaList   (N3 — vem direto da narrativa)
//   4. LeituraBlock     (N4 — vem direto da narrativa)
//
// REGRA: as chaves de `narrativa.sublabels` já foram pensadas pelos builders.
// A UI só decide QUAIS chaves exibir como KPI em destaque (o resto fica
// implícito em descobertas e leitura). Nada de inventar KPI novo aqui.

import type {
  ExecutiveAgregados,
  ExecutiveNarrativa,
} from '@/lib/dashboard/composer'
import type { AbaNarrativa, Sublabel } from '@/lib/dashboard/narrativa/types'
import {
  fmtBRL,
  fmtPct,
  fmtMeses,
} from '@/lib/dashboard/narrativa/types'

import { VeredictoCard }  from './veredicto-card'
import { KpiCard }        from './kpi-card'
import { LeituraBlock }   from './leitura-block'
import { DescobertaList } from './descoberta-list'

// ─── Helpers de formatação pontual ──────────────────────────────────────────

function fmtDias(n: number): string {
  const abs = Math.abs(Math.round(n))
  return abs === 1 ? '1 dia' : `${abs} dias`
}

/** Value + tom opcional wrapper pra KPI. */
interface Kpi {
  key:      string              // usado só como React key
  value:    string
  sublabel: Sublabel
  tom?:     'positivo' | 'atencao' | 'critico'
  size?:    'md' | 'lg'
}

function KpiGrid({ kpis, cols = 3 }: { kpis: Kpi[]; cols?: 2 | 3 | 4 }) {
  if (kpis.length === 0) return null
  const colCls =
    cols === 4 ? 'md:grid-cols-4'
  : cols === 3 ? 'md:grid-cols-3'
  :              'md:grid-cols-2'
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${colCls} gap-3 md:gap-4`}>
      {kpis.map((k) => (
        <KpiCard
          key={k.key}
          value={k.value}
          sublabel={k.sublabel}
          tom={k.tom}
          size={k.size}
        />
      ))}
    </div>
  )
}

// ─── Wrapper genérico (AbaShell) ─────────────────────────────────────────────
//
// Todas as panes compartilham esse esqueleto. Varia só a grade de KPIs no meio.

function AbaShell({
  narrativa,
  kpiSlot,
}: {
  narrativa: AbaNarrativa
  kpiSlot:   React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <VeredictoCard veredicto={narrativa.veredicto} />
      {kpiSlot}
      <DescobertaList descobertas={narrativa.descobertas} />
      <LeituraBlock leitura={narrativa.leitura} />
    </div>
  )
}

// ─── PANE · Visão Geral ──────────────────────────────────────────────────────

export function PaneVisaoGeral({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const v = agregados.visao_geral
  const n = narrativa.visao_geral

  const resultadoTom = v.resultado_mes < 0 ? 'critico'
                     : v.margem_mes_pct >= 25 ? 'positivo'
                     : v.margem_mes_pct < 15 ? 'atencao'
                     : undefined

  const runwayTom = v.runway_meses < 2 ? 'critico'
                  : v.runway_meses < 3 ? 'atencao'
                  : 'positivo'

  const kpis: Kpi[] = [
    { key: 'health',    value: `${v.health_score}/100`,         sublabel: n.sublabels.health_score },
    { key: 'receita',   value: fmtBRL(v.receita_mes),           sublabel: n.sublabels.receita_mes,   size: 'lg' },
    { key: 'custo',     value: fmtBRL(v.custo_mes),             sublabel: n.sublabels.custo_mes },
    { key: 'resultado', value: fmtBRL(v.resultado_mes),         sublabel: n.sublabels.resultado_mes, tom: resultadoTom, size: 'lg' },
    { key: 'margem',    value: fmtPct(v.margem_mes_pct, 0),     sublabel: n.sublabels.margem_mes_pct },
    { key: 'runway',    value: fmtMeses(v.runway_meses),        sublabel: n.sublabels.runway_meses,  tom: runwayTom },
  ]

  return <AbaShell narrativa={n} kpiSlot={<KpiGrid kpis={kpis} cols={3} />} />
}

// ─── PANE · Inadimplência ────────────────────────────────────────────────────

export function PaneInadimplencia({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const i = agregados.inadimplencia
  const n = narrativa.inadimplencia

  const taxaTom  = i.taxa_pct >= 15 ? 'critico' : i.taxa_pct >= 5 ? 'atencao' : 'positivo'
  const abertoTom = i.total_em_aberto > 0 ? (i.taxa_pct >= 15 ? 'critico' : 'atencao') : 'positivo'

  const kpis: Kpi[] = [
    { key: 'aberto',    value: fmtBRL(i.total_em_aberto),    sublabel: n.sublabels.total_em_aberto,   tom: abertoTom, size: 'lg' },
    { key: 'taxa',      value: fmtPct(i.taxa_pct, 0),        sublabel: n.sublabels.taxa_pct,          tom: taxaTom },
    { key: 'pmr',       value: fmtDias(i.pmr_dias),          sublabel: n.sublabels.pmr_dias },
    { key: 'provisao',  value: fmtBRL(i.provisao_sugerida),  sublabel: n.sublabels.provisao_sugerida },
  ]

  return (
    <AbaShell
      narrativa={n}
      kpiSlot={
        <div className="flex flex-col gap-4">
          <KpiGrid kpis={kpis} cols={4} />
          {i.top_devedores.length > 0 && (
            <TopDevedoresTable
              rows={i.top_devedores.slice(0, 5)}
              sublabel={n.sublabels.top_devedores}
            />
          )}
        </div>
      }
    />
  )
}

function TopDevedoresTable({
  rows,
  sublabel,
}: {
  rows: ExecutiveAgregados['inadimplencia']['top_devedores']
  sublabel: Sublabel
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>
      <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-3">
        {sublabel.sublabel}
      </p>
      <ul className="flex flex-col divide-y divide-[#2a2a2a]">
        {rows.map((d, idx) => (
          <li key={d.cliente + idx} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-bold text-[#525252] tabular-nums w-5 shrink-0">
                {idx + 1}.
              </span>
              <span className="text-sm text-[#e5e5e5] truncate">{d.cliente}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#737373] tabular-nums">
                {fmtDias(d.dias_atraso)}
              </span>
              <span className="text-sm font-medium text-white tabular-nums">
                {fmtBRL(d.valor)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── PANE · Receita ──────────────────────────────────────────────────────────

export function PaneReceita({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const r = agregados.receita
  const n = narrativa.receita

  const momTom = r.mom_pct <= -5 ? 'atencao' : r.mom_pct >= 10 ? 'positivo' : undefined
  const pctConfirmadaTom = r.pct_confirmada >= 70 ? 'positivo'
                         : r.pct_confirmada < 50  ? 'atencao'
                         :                          undefined

  const kpis: Kpi[] = [
    { key: 'mes',        value: fmtBRL(r.receita_mes),        sublabel: n.sublabels.receita_mes,   tom: momTom, size: 'lg' },
    { key: 'confirmada', value: fmtBRL(r.confirmada),         sublabel: n.sublabels.confirmada },
    { key: 'prevista',   value: fmtBRL(r.prevista),           sublabel: n.sublabels.prevista },
    { key: 'pct',        value: fmtPct(r.pct_confirmada, 0),  sublabel: n.sublabels.pct_confirmada, tom: pctConfirmadaTom },
    { key: 'ticket',     value: fmtBRL(r.ticket_medio),       sublabel: n.sublabels.ticket_medio },
    { key: 'mom',        value: fmtPct(r.mom_pct, 0),         sublabel: n.sublabels.mom_pct,       tom: momTom },
  ]

  return (
    <AbaShell
      narrativa={n}
      kpiSlot={
        <div className="flex flex-col gap-4">
          <KpiGrid kpis={kpis} cols={3} />
          {r.ranking_clientes.length > 0 && (
            <RankingClientesTable
              rows={r.ranking_clientes.slice(0, 5)}
              sublabel={n.sublabels.ranking_clientes}
            />
          )}
        </div>
      }
    />
  )
}

function RankingClientesTable({
  rows,
  sublabel,
}: {
  rows: ExecutiveAgregados['receita']['ranking_clientes']
  sublabel: Sublabel
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>
      <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-3">
        {sublabel.sublabel}
      </p>
      <ul className="flex flex-col divide-y divide-[#2a2a2a]">
        {rows.map((c, idx) => (
          <li key={c.cliente + idx} className="flex items-center justify-between py-2 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-bold text-[#525252] tabular-nums w-5 shrink-0">
                {idx + 1}.
              </span>
              <span className="text-sm text-[#e5e5e5] truncate">{c.cliente}</span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-xs text-[#737373] tabular-nums">
                {fmtPct(c.pct, 0)} da receita
              </span>
              <span className="text-sm font-medium text-white tabular-nums">
                {fmtBRL(c.valor)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── PANE · Custos ───────────────────────────────────────────────────────────

export function PaneCustos({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const c = agregados.custos
  const n = narrativa.custos

  const ratioTom = c.custo_receita_ratio >= 0.80 ? 'critico'
                 : c.custo_receita_ratio >= 0.60 ? 'atencao'
                 : 'positivo'

  const fixosTom = c.fixos_pct >= 60 ? 'atencao' : undefined

  // ratio vem decimal (0.8 = 80%) — traduzimos pra "de cada R$100"
  const ratioValue = `${Math.round(c.custo_receita_ratio * 100)}%`

  const kpis: Kpi[] = [
    { key: 'total',     value: fmtBRL(c.custo_total_mes),  sublabel: n.sublabels.custo_total_mes, size: 'lg' },
    { key: 'fixos',     value: fmtBRL(c.fixos_mes),        sublabel: n.sublabels.fixos_mes },
    { key: 'variaveis', value: fmtBRL(c.variaveis_mes),    sublabel: n.sublabels.variaveis_mes },
    { key: 'fixosPct',  value: fmtPct(c.fixos_pct, 0),     sublabel: n.sublabels.fixos_pct,         tom: fixosTom },
    { key: 'ratio',     value: ratioValue,                 sublabel: n.sublabels.custo_receita_ratio, tom: ratioTom },
    { key: 'equilibrio', value: fmtBRL(c.ponto_equilibrio), sublabel: n.sublabels.ponto_equilibrio },
  ]

  return (
    <AbaShell
      narrativa={n}
      kpiSlot={
        <div className="flex flex-col gap-4">
          <KpiGrid kpis={kpis} cols={3} />
          {c.top_despesas.length > 0 && (
            <TopDespesasTable
              rows={c.top_despesas.slice(0, 5)}
              sublabel={n.sublabels.top_despesas}
            />
          )}
        </div>
      }
    />
  )
}

function TopDespesasTable({
  rows,
  sublabel,
}: {
  rows: ExecutiveAgregados['custos']['top_despesas']
  sublabel: Sublabel
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>
      <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-3">
        {sublabel.sublabel}
      </p>
      <ul className="flex flex-col divide-y divide-[#2a2a2a]">
        {rows.map((d, idx) => (
          <li key={d.descricao + idx} className="flex items-center justify-between py-2 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-bold text-[#525252] tabular-nums w-5 shrink-0">
                {idx + 1}.
              </span>
              <div className="min-w-0">
                <p className="text-sm text-[#e5e5e5] truncate">{d.descricao}</p>
                <p className="text-[10px] text-[#525252] uppercase tracking-wider">
                  {d.categoria}
                </p>
              </div>
            </div>
            <span className="text-sm font-medium text-white tabular-nums shrink-0">
              {fmtBRL(d.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── PANE · Clientes ─────────────────────────────────────────────────────────

export function PaneClientes({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const cl = agregados.clientes
  const n  = narrativa.clientes

  const top1Tom = cl.concentracao.top1_pct >= 40 ? 'critico'
                : cl.concentracao.top1_pct >= 30 ? 'atencao'
                : cl.concentracao.top1_pct <= 20 ? 'positivo'
                : undefined

  const hhiTom = cl.hhi >= 2500 ? 'atencao'
               : cl.hhi < 1500  ? 'positivo'
               :                  undefined

  const kpis: Kpi[] = [
    { key: 'total',        value: `${cl.total_clientes}`,                sublabel: n.sublabels.total_clientes, size: 'lg' },
    { key: 'top1',         value: fmtPct(cl.concentracao.top1_pct, 0),   sublabel: n.sublabels.top1_pct,      tom: top1Tom },
    { key: 'top5',         value: fmtPct(cl.concentracao.top5_pct, 0),   sublabel: n.sublabels.top5_pct },
    { key: 'hhi',          value: `${Math.round(cl.hhi)}`,               sublabel: n.sublabels.hhi,           tom: hhiTom },
    { key: 'novos',        value: `${cl.novos_vs_recorrentes.novos}`,    sublabel: n.sublabels.novos_vs_recorrentes },
  ]

  return (
    <AbaShell
      narrativa={n}
      kpiSlot={
        <div className="flex flex-col gap-4">
          <KpiGrid kpis={kpis} cols={3} />
          {cl.ranking_receita.length > 0 && (
            <RankingClientesMargemTable
              rows={cl.ranking_receita.slice(0, 5)}
              sublabel={n.sublabels.ranking_receita}
            />
          )}
        </div>
      }
    />
  )
}

function RankingClientesMargemTable({
  rows,
  sublabel,
}: {
  rows: ExecutiveAgregados['clientes']['ranking_receita']
  sublabel: Sublabel
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>
      <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-3">
        {sublabel.sublabel}
      </p>
      <ul className="flex flex-col divide-y divide-[#2a2a2a]">
        {rows.map((c, idx) => {
          const margemTom = c.margem_pct >= 25 ? 'text-emerald-400'
                          : c.margem_pct < 15  ? 'text-red-400'
                          :                      'text-[#D4A853]'
          return (
            <li key={c.cliente + idx} className="flex items-center justify-between py-2 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-bold text-[#525252] tabular-nums w-5 shrink-0">
                  {idx + 1}.
                </span>
                <span className="text-sm text-[#e5e5e5] truncate">{c.cliente}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className={`text-xs tabular-nums ${margemTom}`}>
                  margem {fmtPct(c.margem_pct, 0)}
                </span>
                <span className="text-sm font-medium text-white tabular-nums">
                  {fmtBRL(c.receita)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── PANE · Diagnóstico ──────────────────────────────────────────────────────
//
// Meta-aba. Não tem KPI numérico — tem contagens de sinais + ações recomendadas.

export function PaneDiagnostico({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const d = agregados.diagnostico
  const n = narrativa.diagnostico

  const kpis: Kpi[] = [
    {
      key:   'pos',
      value: `${d.pontos_positivos.length}`,
      sublabel: n.sublabels.pontos_positivos,
      tom:   d.pontos_positivos.length > 0 ? 'positivo' : undefined,
    },
    {
      key:   'ale',
      value: `${d.alertas.length}`,
      sublabel: n.sublabels.alertas,
      tom:   d.alertas.length > 0 ? 'atencao' : undefined,
    },
    {
      key:   'cri',
      value: `${d.criticos.length}`,
      sublabel: n.sublabels.criticos,
      tom:   d.criticos.length > 0 ? 'critico' : undefined,
    },
  ]

  return (
    <AbaShell
      narrativa={n}
      kpiSlot={
        <div className="flex flex-col gap-4">
          <KpiGrid kpis={kpis} cols={3} />
          {d.acoes.length > 0 && (
            <AcoesList acoes={d.acoes} sublabel={n.sublabels.acoes} />
          )}
        </div>
      }
    />
  )
}

function AcoesList({
  acoes,
  sublabel,
}: {
  acoes:    ExecutiveAgregados['diagnostico']['acoes']
  sublabel: Sublabel
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>
      <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-3">
        {sublabel.sublabel}
      </p>
      <ol className="flex flex-col gap-3">
        {acoes.map((a, idx) => (
          <li
            key={a.titulo + idx}
            className="flex gap-3 items-start rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-3"
          >
            <span className="flex items-center justify-center h-6 w-6 shrink-0 rounded-full bg-[#D4A853] text-[#0a0a0a] text-[11px] font-bold tabular-nums">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{a.titulo}</p>
              <p className="text-xs text-[#a3a3a3] leading-relaxed mt-1">
                {a.descricao}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ─── PANE · Conclusão ────────────────────────────────────────────────────────
//
// TL;DR. Poucas palavras, muito peso. O veredicto aqui é o coração da aba.
// Em lugar de KPIs numéricos, exibimos os 3 blocos de resumo + prioridades.

export function PaneConclusao({
  agregados,
  narrativa,
}: {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}) {
  const c = agregados.conclusao
  const n = narrativa.conclusao

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <VeredictoCard veredicto={n.veredicto} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <ResumoCard
          sublabel={n.sublabels.resumo_positivo}
          texto={c.resumo.positivo}
          tom="positivo"
        />
        <ResumoCard
          sublabel={n.sublabels.resumo_risco}
          texto={c.resumo.risco}
          tom={c.status_geral === 'critico' ? 'critico' : 'atencao'}
        />
        <ResumoCard
          sublabel={n.sublabels.resumo_acao}
          texto={c.resumo.acao}
          tom="atencao"
        />
      </div>

      {c.prioridade_abas.length > 0 && (
        <PrioridadeAbasBlock
          prioridades={c.prioridade_abas}
          sublabel={n.sublabels.prioridade_abas}
        />
      )}

      <DescobertaList descobertas={n.descobertas} />
      <LeituraBlock leitura={n.leitura} />
    </div>
  )
}

function ResumoCard({
  sublabel,
  texto,
  tom,
}: {
  sublabel: Sublabel
  texto:    string
  tom:      'positivo' | 'atencao' | 'critico'
}) {
  const style =
      tom === 'positivo' ? 'border-emerald-500/30 bg-emerald-500/5'
    : tom === 'critico'  ? 'border-red-500/40 bg-red-500/5'
    :                      'border-[#D4A853]/40 bg-[#D4A853]/5'
  const dot =
      tom === 'positivo' ? 'bg-emerald-400'
    : tom === 'critico'  ? 'bg-red-400'
    :                      'bg-[#D4A853]'
  return (
    <div className={`rounded-xl border ${style} bg-[#141414] p-4 md:p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
          {sublabel.label}
        </p>
      </div>
      <p className="text-sm text-[#e5e5e5] leading-relaxed mb-2">{texto}</p>
      <p className="text-[11px] text-[#737373] leading-relaxed">{sublabel.sublabel}</p>
    </div>
  )
}

function PrioridadeAbasBlock({
  prioridades,
  sublabel,
}: {
  prioridades: ExecutiveAgregados['conclusao']['prioridade_abas']
  sublabel:    Sublabel
}) {
  const NOME: Record<string, string> = {
    inadimplencia: 'Inadimplência',
    visao_geral:   'Visão Geral',
    receita:       'Receita',
    custos:        'Custos',
    clientes:      'Clientes',
    diagnostico:   'Diagnóstico',
  }
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>
      <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-3">
        {sublabel.sublabel}
      </p>
      <ol className="flex flex-col gap-2">
        {prioridades.map((p, idx) => (
          <li
            key={p.aba + idx}
            className="flex gap-3 items-start rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-3"
          >
            <span className="flex items-center justify-center h-6 w-6 shrink-0 rounded-full bg-[#D4A853] text-[#0a0a0a] text-[11px] font-bold tabular-nums">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">
                {NOME[p.aba] ?? p.aba}
              </p>
              <p className="text-xs text-[#a3a3a3] leading-relaxed mt-1">
                {p.motivo}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
