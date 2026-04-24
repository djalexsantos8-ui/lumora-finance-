// ─── ClientDetail · Centro operacional do cliente ────────────────────────────
//
// Client component renderizado por /clientes/[id]. Objetivo:
//   1. ficha cadastral (editável, colapsável)
//   2. KPIs de relacionamento (quantos orçamentos, pedidos, etc.)
//   3. histórico por tipo: orçamentos, pedidos, freelances, recorrentes, contratos
//   4. sinais operacionais: recorrência ativa vs. cancelada; jobs legados sem
//      client_id; notas internas
//
// NÃO é só formulário. Cada bloco dá para navegar direto pra entidade.

'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateClient, deleteClient } from '@/lib/actions/clients'
import { ClientFullForm, type ClientFullFormValue } from '@/components/clients/client-full-form'
import type { Client } from '@/types/client'
import type { Budget, BudgetStatus } from '@/types/budget'
import type { Order } from '@/types/order'
import type { Job } from '@/types/job'
import type { RecurringRevenue } from '@/types/recurring-revenue'
import type { Contract, ContractStatus } from '@/types/contract'

interface Props {
  client:     Client
  budgets:    Budget[]
  orders:     Order[]
  jobsById:   Job[]
  jobsLegacy: Job[]
  recurrings: RecurringRevenue[]
  contracts:  Contract[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return '—' }
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(value ?? 0)
  const c = currency || 'BRL'
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: c,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${c} ${n.toFixed(2)}`
  }
}

function clientToFormValue(c: Client): ClientFullFormValue {
  return {
    phone:     c.phone             ?? '',
    instagram: c.instagram         ?? '',
    email:     c.email             ?? '',
    document:  c.document          ?? '',
    notes:     c.notes             ?? '',
    person_type:        (c.person_type as '' | 'pf' | 'pj') || '',
    legal_name:         c.legal_name        ?? '',
    trade_name:         c.trade_name        ?? '',
    document_cpf:       c.document_cpf      ?? '',
    document_cnpj:      c.document_cnpj     ?? '',
    address_line:       c.address_line      ?? '',
    address_city:       c.address_city      ?? '',
    address_state:      c.address_state     ?? '',
    address_zip:        c.address_zip       ?? '',
    segment:            c.segment           ?? '',
    lead_source:        c.lead_source       ?? '',
    payment_condition:  c.payment_condition ?? '',
    responsible_name:   c.responsible_name  ?? '',
    responsible_role:   c.responsible_role  ?? '',
  }
}

const BUDGET_STATUS_COLORS: Record<BudgetStatus, string> = {
  draft:    'bg-[#2a2a2a] text-[#a3a3a3]',
  sent:     'bg-sky-500/10 text-sky-400',
  approved: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
  expired:  'bg-amber-500/10 text-amber-400',
}
const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  draft:    'Rascunho',
  sent:     'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  expired:  'Expirado',
}

const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  draft:     'bg-[#2a2a2a] text-[#a3a3a3]',
  generated: 'bg-[#D4A853]/10 text-[#E8C47A]',
  reviewed:  'bg-emerald-500/10 text-emerald-400',
  signed:    'bg-sky-500/10 text-sky-400',
  cancelled: 'bg-red-500/10 text-red-400',
}
const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft:     'Rascunho',
  generated: 'Gerado',
  reviewed:  'Revisado',
  signed:    'Assinado',
  cancelled: 'Cancelado',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ClientDetail({
  client,
  budgets,
  orders,
  jobsById,
  jobsLegacy,
  recurrings,
  contracts,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(client.name)
  const [form, setForm] = useState<ClientFullFormValue>(() => clientToFormValue(client))
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // KPIs computed once — cheap.
  const kpis = useMemo(() => {
    const activeRecurring = recurrings.filter(r => r.status === 'active').length
    const cancelledRecurring = recurrings.filter(r => r.status === 'cancelled').length
    const everRecurring = recurrings.length
    const hasRecurringComeback =
      activeRecurring > 0 && cancelledRecurring > 0
    const signedContracts = contracts.filter(c => c.status === 'signed').length
    const totalInvoicedFromOrders = orders.reduce(
      (acc, o) => acc + Number(o.revenue_total || 0),
      0
    )
    return {
      budgets:    budgets.length,
      orders:     orders.length,
      jobs:       jobsById.length + jobsLegacy.length,
      recurrings: recurrings.length,
      activeRecurring,
      cancelledRecurring,
      hasRecurringComeback,
      contracts:  contracts.length,
      signedContracts,
      totalInvoicedFromOrders,
      everRecurring,
    }
  }, [budgets, orders, jobsById, jobsLegacy, recurrings, contracts])

  // Resumo financeiro — agrega receita bruta por origem (pedidos + freelances).
  // Não mistura moedas: tudo em BRL (se houver outras, ignora) para não
  // mentir sobre conversão. Usuário vê total por origem com moeda real.
  const finSummary = useMemo(() => {
    function sumInCurrency<T extends { revenue_total?: number | null; currency?: string | null }>(
      rows: T[],
      currency: string
    ) {
      return rows
        .filter(r => (r.currency ?? 'BRL') === currency)
        .reduce((acc, r) => acc + Number(r.revenue_total || 0), 0)
    }
    const brlOrders    = sumInCurrency(orders, 'BRL')
    const brlJobs      = sumInCurrency([...jobsById, ...jobsLegacy], 'BRL')
    const brlRecurMonthly = recurrings
      .filter(r => r.status === 'active' && (r.currency ?? 'BRL') === 'BRL')
      .reduce((acc, r) => acc + Number(r.amount || 0), 0)
    const brlTotal = brlOrders + brlJobs
    return {
      brlOrders,
      brlJobs,
      brlRecurMonthly,
      brlTotal,
      hasMultiCurrency: [...orders, ...jobsById, ...jobsLegacy, ...recurrings]
        .some(r => ((r as { currency?: string | null }).currency ?? 'BRL') !== 'BRL'),
    }
  }, [orders, jobsById, jobsLegacy, recurrings])

  function showToast(kind: 'success' | 'error', message: string) {
    setToast({ kind, message })
    window.setTimeout(() => setToast(null), 3200)
  }

  function handleSave() {
    startTransition(async () => {
      const res = await updateClient(client.id, {
        name,
        phone:             form.phone             || null,
        instagram:         form.instagram         || null,
        email:             form.email             || null,
        document:          form.document          || null,
        notes:             form.notes             || null,
        person_type:       (form.person_type || null) as 'pf' | 'pj' | null,
        legal_name:        form.legal_name        || null,
        trade_name:        form.trade_name        || null,
        document_cpf:      form.document_cpf      || null,
        document_cnpj:     form.document_cnpj     || null,
        address_line:      form.address_line      || null,
        address_city:      form.address_city      || null,
        address_state:     form.address_state     || null,
        address_zip:       form.address_zip       || null,
        segment:           form.segment           || null,
        lead_source:       form.lead_source       || null,
        payment_condition: form.payment_condition || null,
        responsible_name:  form.responsible_name  || null,
        responsible_role:  form.responsible_role  || null,
      })
      if (res.success) {
        setEditing(false)
        showToast('success', 'Ficha atualizada.')
        router.refresh()
      } else {
        showToast('error', res.message)
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteClient(client.id)
      if (res.success) {
        router.push('/clientes')
      } else {
        showToast('error', res.message ?? 'Erro ao excluir cliente.')
        setConfirmingDelete(false)
      }
    })
  }

  const displayName = name.trim() || client.name || 'Cliente sem nome'
  const isPJ = client.person_type === 'pj' || !!client.document_cnpj || !!client.legal_name
  const inputCls =
    'w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors disabled:opacity-60'

  return (
    <div className="min-h-full p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <Link
            href="/clientes"
            className="text-xs text-[#737373] hover:text-white transition-colors inline-flex items-center gap-1 mb-2"
          >
            ← Voltar para clientes
          </Link>
          {editing ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isPending}
              className="text-2xl font-bold bg-transparent border-b border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none w-full text-white"
              placeholder="Nome do cliente"
            />
          ) : (
            <h1 className="text-2xl font-bold text-white truncate">
              {displayName}
            </h1>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[#737373]">
              {isPJ ? 'Pessoa Jurídica' : client.person_type === 'pf' ? 'Pessoa Física' : 'Tipo não definido'}
            </span>
            {client.segment && (
              <>
                <span className="text-[10px] text-[#2a2a2a]">•</span>
                <span className="text-[10px] uppercase tracking-wider text-[#D4A853]">
                  {client.segment}
                </span>
              </>
            )}
            {client.lead_source && (
              <>
                <span className="text-[10px] text-[#2a2a2a]">•</span>
                <span className="text-[10px] text-[#737373]">
                  origem: {client.lead_source}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => { setEditing(false); setName(client.name); setForm(clientToFormValue(client)) }}
                disabled={isPending}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#D4A853] hover:bg-[#E8C47A] text-black transition-colors disabled:opacity-50"
              >
                {isPending ? 'Salvando…' : 'Salvar ficha'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors"
              >
                Editar ficha
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/50 transition-colors"
              >
                Remover
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Orçamentos"  value={kpis.budgets} />
        <Kpi label="Pedidos"     value={kpis.orders} sub={kpis.totalInvoicedFromOrders > 0 ? formatMoney(kpis.totalInvoicedFromOrders, 'BRL') : undefined} />
        <Kpi label="Freelances"  value={kpis.jobs} sub={jobsLegacy.length > 0 ? `${jobsLegacy.length} legado(s)` : undefined} />
        <Kpi
          label="Recorrentes"
          value={kpis.recurrings}
          sub={
            kpis.activeRecurring > 0
              ? `${kpis.activeRecurring} ativa(s)`
              : kpis.cancelledRecurring > 0
                ? `${kpis.cancelledRecurring} cancelada(s)`
                : undefined
          }
          accent={kpis.activeRecurring > 0 ? 'emerald' : kpis.cancelledRecurring > 0 ? 'red' : undefined}
        />
        <Kpi
          label="Contratos"
          value={kpis.contracts}
          sub={kpis.signedContracts > 0 ? `${kpis.signedContracts} assinado(s)` : undefined}
          accent={kpis.signedContracts > 0 ? 'emerald' : undefined}
        />
      </div>

      {/* ── Resumo financeiro ────────────────────────────────────────────── */}
      {(finSummary.brlTotal > 0 || finSummary.brlRecurMonthly > 0) && (
        <section className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Resumo financeiro</h2>
            {finSummary.hasMultiCurrency && (
              <span
                title="Este cliente tem lançamentos em moedas diferentes. O resumo agrega apenas BRL para evitar conversão imprecisa."
                className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full"
              >
                multi-moeda (mostrando só BRL)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FinCard
              label="Total bruto"
              value={formatMoney(finSummary.brlTotal, 'BRL')}
              sub="pedidos + freelances"
              accent="gold"
            />
            <FinCard
              label="Pedidos"
              value={formatMoney(finSummary.brlOrders, 'BRL')}
              sub={`${orders.length} pedido${orders.length === 1 ? '' : 's'}`}
            />
            <FinCard
              label="Freelances"
              value={formatMoney(finSummary.brlJobs, 'BRL')}
              sub={`${jobsById.length + jobsLegacy.length} freelance${(jobsById.length + jobsLegacy.length) === 1 ? '' : 's'}`}
            />
            <FinCard
              label="Recorrente ativa"
              value={finSummary.brlRecurMonthly > 0 ? `${formatMoney(finSummary.brlRecurMonthly, 'BRL')}/mês` : '—'}
              sub={kpis.activeRecurring > 0 ? `${kpis.activeRecurring} contrato${kpis.activeRecurring === 1 ? '' : 's'}` : undefined}
              accent={kpis.activeRecurring > 0 ? 'emerald' : undefined}
            />
          </div>
        </section>
      )}

      {/* ── Sinal: recorrência que voltou ────────────────────────────────── */}
      {kpis.hasRecurringComeback && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-start gap-3">
          <span className="text-emerald-400 text-lg leading-none">↻</span>
          <div className="text-xs text-emerald-300">
            Este cliente teve recorrência cancelada e voltou a ter recorrência ativa.
            Ver detalhes na seção "Receitas recorrentes" abaixo.
          </div>
        </div>
      )}

      {/* ── Ficha — compacta + edit mode expandido ───────────────────────── */}
      <section className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Dados do cliente</h2>
          {!editing && (
            <span className="text-[10px] text-[#525252]">
              Criado em {formatDate(client.created_at)}
            </span>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#737373] font-medium mb-1.5">
                Nome do cliente *
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isPending}
                className={inputCls}
              />
            </div>
            <ClientFullForm
              value={form}
              onChange={setForm}
              disabled={isPending}
              nameReadOnly
            />
          </div>
        ) : (
          <FichaSummary client={client} />
        )}
      </section>

      {/* ── Histórico: Orçamentos ────────────────────────────────────────── */}
      <HistorySection
        title="Orçamentos"
        count={budgets.length}
        emptyMessage="Este cliente ainda não tem orçamentos."
      >
        {budgets.map(b => (
          <Link
            key={b.id}
            href={`/budgets/${b.id}`}
            className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg px-3 py-2.5 transition-colors group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate font-medium">
                {b.title?.trim() || 'Orçamento sem título'}
              </p>
              <p className="text-[10px] text-[#525252] mt-0.5">
                {formatDate(b.event_date) !== '—' ? `Evento: ${formatDate(b.event_date)} · ` : ''}
                Criado em {formatDate(b.created_at)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono text-white">{formatMoney(b.total, b.currency)}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${BUDGET_STATUS_COLORS[b.status] ?? BUDGET_STATUS_COLORS.draft}`}>
                {BUDGET_STATUS_LABELS[b.status] ?? b.status}
              </span>
            </div>
          </Link>
        ))}
      </HistorySection>

      {/* ── Histórico: Pedidos ───────────────────────────────────────────── */}
      <HistorySection
        title="Pedidos"
        count={orders.length}
        emptyMessage="Este cliente ainda não virou pedido."
      >
        {orders.map(o => (
          <Link
            key={o.id}
            href={`/pedidos/${o.id}`}
            className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg px-3 py-2.5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate font-medium">
                {o.title?.trim() || 'Pedido sem título'}
              </p>
              <p className="text-[10px] text-[#525252] mt-0.5">
                Criado em {formatDate(o.created_at)}
                {o.status ? ` · ${o.status}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono text-white">
                {formatMoney(o.revenue_total, o.currency)}
              </p>
            </div>
          </Link>
        ))}
      </HistorySection>

      {/* ── Histórico: Freelances ────────────────────────────────────────── */}
      <HistorySection
        title="Freelances"
        count={jobsById.length + jobsLegacy.length}
        emptyMessage="Nenhum freelance cadastrado para este cliente."
        subtitle={
          jobsLegacy.length > 0
            ? `${jobsLegacy.length} freelance(s) legado(s) encontrado(s) por nome — abra para vincular via client_id.`
            : undefined
        }
      >
        {[...jobsById, ...jobsLegacy].map(j => {
          const isLegacy = !j.client_id
          return (
            <Link
              key={j.id}
              href={`/freelances/${j.id}`}
              className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg px-3 py-2.5 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-white truncate font-medium">
                    {j.title?.trim() || 'Freelance sem título'}
                  </p>
                  {isLegacy && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      legado
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#525252] mt-0.5">
                  {formatDate(j.job_date ?? j.job_date_start)}
                  {j.status ? ` · ${j.status}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono text-white">
                  {formatMoney(j.revenue_total, j.currency)}
                </p>
              </div>
            </Link>
          )
        })}
      </HistorySection>

      {/* ── Histórico: Recorrentes ───────────────────────────────────────── */}
      <HistorySection
        title="Receitas recorrentes"
        count={recurrings.length}
        emptyMessage="Nenhuma receita recorrente com este cliente."
      >
        {recurrings.map(r => (
          <Link
            key={r.id}
            href={`/receitas-recorrentes/${r.id}`}
            className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg px-3 py-2.5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate font-medium">
                {r.title?.trim() || 'Recorrência sem título'}
              </p>
              <p className="text-[10px] text-[#525252] mt-0.5">
                Início: {formatDate(r.started_at)}
                {r.cancelled_at ? ` · cancelada em ${formatDate(r.cancelled_at)}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono text-white">
                {formatMoney(r.amount, r.currency)} / mês
              </p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                r.status === 'active'    ? 'bg-emerald-500/10 text-emerald-400' :
                r.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                r.status === 'paused'    ? 'bg-amber-500/10 text-amber-400' :
                'bg-[#2a2a2a] text-[#a3a3a3]'
              }`}>
                {r.status === 'active' ? 'Ativa' : r.status === 'cancelled' ? 'Cancelada' : r.status === 'paused' ? 'Pausada' : r.status}
              </span>
            </div>
          </Link>
        ))}
      </HistorySection>

      {/* ── Histórico: Contratos ─────────────────────────────────────────── */}
      <HistorySection
        title="Contratos"
        count={contracts.length}
        emptyMessage="Nenhum contrato gerado para este cliente."
      >
        {contracts.map(c => (
          <Link
            key={c.id}
            href={`/contracts/${c.id}`}
            className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg px-3 py-2.5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate font-medium">
                {c.title?.trim() || 'Contrato sem título'}
              </p>
              <p className="text-[10px] text-[#525252] mt-0.5">
                Tipo: {c.contract_type} · Criado em {formatDate(c.created_at)}
              </p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CONTRACT_STATUS_COLORS[c.status] ?? CONTRACT_STATUS_COLORS.draft}`}>
              {CONTRACT_STATUS_LABELS[c.status] ?? c.status}
            </span>
          </Link>
        ))}
      </HistorySection>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium border shadow-xl z-50 whitespace-nowrap ${
          toast.kind === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ── Modal confirm delete ─────────────────────────────────────────── */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmingDelete(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">Remover cliente</h3>
            <p className="text-xs text-[#a3a3a3] mb-4">
              O cliente será removido da listagem (soft delete). Orçamentos, pedidos
              e contratos já vinculados não são afetados — mantêm o nome salvo.
              Você pode restaurar depois.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={isPending}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Removendo…' : 'Remover cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ficha summary (view mode) ───────────────────────────────────────────────

function FichaSummary({ client }: { client: Client }) {
  const rows: Array<[string, string | null | undefined]> = [
    ['Telefone',           client.phone],
    ['Instagram',          client.instagram ? `@${client.instagram.replace(/^@/, '')}` : null],
    ['Email',              client.email],
    ['Documento',          client.document],
    ['CPF',                client.document_cpf],
    ['CNPJ',               client.document_cnpj],
    ['Razão social',       client.legal_name],
    ['Nome fantasia',      client.trade_name],
    ['Endereço',           client.address_line],
    ['Cidade / UF',        [client.address_city, client.address_state].filter(Boolean).join(' / ') || null],
    ['CEP',                client.address_zip],
    ['Responsável',        [client.responsible_name, client.responsible_role].filter(Boolean).join(' — ') || null],
    ['Condição pgto.',     client.payment_condition],
  ].filter(([, v]) => v && String(v).trim().length > 0) as Array<[string, string]>

  if (rows.length === 0 && !client.notes) {
    return (
      <p className="text-xs text-[#737373] italic">
        Ficha vazia. Clique em "Editar ficha" para preencher dados úteis pra emitir
        contrato e organizar a relação comercial.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="text-xs">
          <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-0.5">{label}</div>
          <div className="text-white">{value}</div>
        </div>
      ))}
      {client.notes && (
        <div className="md:col-span-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-0.5">Notas internas</div>
          <div className="text-[#a3a3a3] whitespace-pre-wrap leading-relaxed">{client.notes}</div>
        </div>
      )}
    </div>
  )
}

// ─── Small primitives ────────────────────────────────────────────────────────

function Kpi({
  label, value, sub, accent,
}: {
  label: string; value: number; sub?: string; accent?: 'emerald' | 'red' | 'gold'
}) {
  const accentCls =
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'red'     ? 'text-red-400' :
    accent === 'gold'    ? 'text-[#D4A853]' :
    'text-white'

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0f0f0f] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accentCls}`}>
        {value.toLocaleString('pt-BR')}
      </div>
      {sub && <div className="text-[10px] text-[#525252] mt-0.5">{sub}</div>}
    </div>
  )
}

function FinCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: 'emerald' | 'red' | 'gold'
}) {
  const accentCls =
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'red'     ? 'text-red-400' :
    accent === 'gold'    ? 'text-[#D4A853]' :
    'text-white'
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0f0f0f] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className={`text-base font-bold tabular-nums mt-1 ${accentCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#525252] mt-0.5">{sub}</div>}
    </div>
  )
}

function HistorySection({
  title, count, emptyMessage, subtitle, children,
}: {
  title:        string
  count:        number
  emptyMessage: string
  subtitle?:    string
  children:     React.ReactNode
}) {
  return (
    <section className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {title} <span className="text-[#525252] font-normal">({count})</span>
          </h2>
          {subtitle && <p className="text-[10px] text-amber-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {count === 0 ? (
        <p className="text-xs text-[#525252] italic">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </section>
  )
}
