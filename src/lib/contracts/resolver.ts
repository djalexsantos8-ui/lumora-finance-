// ─── Contract Context Resolver ──────────────────────────────────────────────
//
// Dado (workspace, contractType, origem opcional, cliente opcional), monta o
// ContractContext: valores resolvidos + sourceLabels (para a UI mostrar "de
// onde veio cada dado") + lista de placeholders faltantes.
//
// Fontes consultadas (em ordem de precedência):
//   1. overrides (vindo da UI do Builder)
//   2. origem operacional (budget/freelance/order/recurring)
//   3. cliente (Client)
//   4. workspace_settings (empresa)
//   5. defaults razoáveis (data_assinatura = hoje, cidade_foro = cidade empresa)
//
// Este módulo é 'use server' — acessa Supabase via server client.

import { createClient } from '@/lib/supabase/server'
import { getContractMeta } from './catalog'
import type {
  ContractContext,
  ContractOriginKind,
  ContractType,
} from '@/types/contract'

interface ResolveInput {
  workspaceId:   string
  contractType:  ContractType
  originKind?:   ContractOriginKind | null
  originId?:     string | null
  clientId?:     string | null
  overrides?:    Record<string, string>
}

export async function resolveContractContext(
  input: ResolveInput
): Promise<ContractContext> {
  const supabase = await createClient()
  const meta = getContractMeta(input.contractType)

  const values: Record<string, string> = {}
  const sourceLabels: Record<string, string> = {}

  const setVal = (key: string, val: string | null | undefined, source: string) => {
    if (val === null || val === undefined) return
    const str = String(val).trim()
    if (!str) return
    // Precedência: não sobrescreve se já veio de fonte anterior (mais prioritária)
    if (values[key] !== undefined) return
    values[key] = str
    sourceLabels[key] = source
  }

  // ─── 1. overrides (maior precedência) ────────────────────────────────────
  if (input.overrides) {
    for (const [k, v] of Object.entries(input.overrides)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        values[k] = String(v).trim()
        sourceLabels[k] = 'manual'
      }
    }
  }

  // ─── 2. origem operacional ──────────────────────────────────────────────
  let originClientId: string | null = null
  let originClientName: string | null = null

  if (input.originKind && input.originId) {
    if (input.originKind === 'budget') {
      // budgets NÃO tem coluna client_id nem FK para clients — não dá pra
      // embedar `client:clients(*)` (PostgREST retorna "Could not find a
      // relationship"). Selecionamos só as colunas que existem de fato.
      // Cliente vem do texto livre (client_name) e o Builder pede o restante.
      const { data: b } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', input.originId)
        .eq('workspace_id', input.workspaceId)
        .maybeSingle()

      if (b) {
        originClientId = null
        originClientName = b.client_name || null
        setVal('titulo_projeto',     b.title, 'orçamento')
        setVal('descricao_projeto',  b.project_description, 'orçamento')
        setVal('escopo_entregaveis', b.deliverables, 'orçamento')
        setVal('data_evento',        formatDatePtBr(b.event_date), 'orçamento')
        setVal('valor_total',        formatBrl(b.total), 'orçamento')
        setVal('valor_por_extenso',  '', 'orçamento') // usuário preenche
        setVal('moeda',              b.currency, 'orçamento')
        setVal('condicao_pagamento', b.payment_term, 'orçamento')
      }
    }

    if (input.originKind === 'freelance') {
      const { data: j } = await supabase
        .from('jobs')
        .select('*, client:clients(*)')
        .eq('id', input.originId)
        .eq('workspace_id', input.workspaceId)
        .maybeSingle()

      if (j) {
        originClientId = j.client_id || (j.client?.id ?? null)
        originClientName = j.client_name || j.client?.name || null
        setVal('titulo_projeto',    j.title, 'freelance')
        setVal('data_evento',       formatDatePtBr(j.job_date), 'freelance')
        setVal('data_inicio',       formatDatePtBr(j.job_date_start || j.job_date), 'freelance')
        setVal('data_fim',          formatDatePtBr(j.job_date_end || j.job_date), 'freelance')
        setVal('valor_total',       formatBrl(Number(j.revenue_total) + Number(j.cost_total)), 'freelance')
        setVal('moeda',             j.currency, 'freelance')
        // Não tem payment_condition como texto — usa payment_condition enum
        if (j.payment_condition) setVal('condicao_pagamento', translatePaymentCondition(j.payment_condition), 'freelance')
      }
    }

    if (input.originKind === 'order') {
      const { data: o } = await supabase
        .from('orders')
        .select('*, client:clients(*)')
        .eq('id', input.originId)
        .eq('workspace_id', input.workspaceId)
        .maybeSingle()

      if (o) {
        originClientId = o.client_id || (o.client?.id ?? null)
        originClientName = o.client_name || o.client?.name || null
        setVal('titulo_projeto',     o.title, 'pedido')
        setVal('descricao_projeto',  o.project_description, 'pedido')
        setVal('escopo_entregaveis', o.deliverables, 'pedido')
        setVal('data_evento',        formatDatePtBr(o.event_date || o.order_date), 'pedido')
        setVal('data_inicio',        formatDatePtBr(o.order_date_start || o.order_date), 'pedido')
        setVal('data_fim',           formatDatePtBr(o.order_date_end || o.order_date), 'pedido')
        setVal('prazo_entrega',      formatDatePtBr(o.delivery_date), 'pedido')
        setVal('valor_total',        formatBrl(o.amount), 'pedido')
        setVal('moeda',              o.currency, 'pedido')
        setVal('condicao_pagamento', o.payment_condition, 'pedido')
      }
    }

    if (input.originKind === 'recurring') {
      const { data: r } = await supabase
        .from('recurring_revenue')
        .select('*, client:clients(*)')
        .eq('id', input.originId)
        .eq('workspace_id', input.workspaceId)
        .maybeSingle()

      if (r) {
        originClientId = r.client_id || (r.client?.id ?? null)
        originClientName = r.client_name || r.client?.name || null
        setVal('titulo_projeto',     r.title, 'receita recorrente')
        setVal('escopo_entregaveis', r.scope_summary || r.project_description, 'receita recorrente')
        setVal('frequencia',         translateFrequency(r.frequency), 'receita recorrente')
        setVal('data_inicio',        formatDatePtBr(r.started_at), 'receita recorrente')
        setVal('valor_mensal',       formatBrl(r.amount), 'receita recorrente')
        setVal('valor_total',        formatBrl(r.amount), 'receita recorrente')
        setVal('dia_pagamento',      r.billing_day ? String(r.billing_day) : '', 'receita recorrente')
      }
    }
  }

  // ─── 3. Cliente ────────────────────────────────────────────────────────
  const clientId = input.clientId || originClientId
  let clientRow: any = null

  if (clientId) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle()
    clientRow = data
  }

  if (clientRow) {
    const c = clientRow
    setVal('contratante_nome', c.legal_name || c.name, 'cliente')
    setVal('contratante_cpf',  c.document_cpf || (c.person_type === 'pf' ? c.document : null), 'cliente')
    setVal('contratante_cnpj', c.document_cnpj || (c.person_type === 'pj' ? c.document : null), 'cliente')

    // documento genérico (para templates com audience=any)
    const doc = c.document_cnpj
      ? `CNPJ ${c.document_cnpj}`
      : c.document_cpf
        ? `CPF ${c.document_cpf}`
        : c.document
          ? (c.person_type === 'pj' ? `CNPJ ${c.document}` : `CPF ${c.document}`)
          : null
    setVal('contratante_documento', doc, 'cliente')

    // Endereço montado
    const addr = [c.address_line, c.address_city, c.address_state, c.address_zip]
      .filter(Boolean).join(' — ')
    setVal('contratante_endereco', addr, 'cliente')

    setVal('contratante_email',    c.email, 'cliente')
    setVal('contratante_telefone', c.phone, 'cliente')

    // Preenche condicao_pagamento do cliente se origem não preencheu
    setVal('condicao_pagamento', c.payment_condition, 'cliente')
  } else if (originClientName) {
    // Cliente não estruturado — usa só o nome
    setVal('contratante_nome', originClientName, 'origem')
  }

  // ─── 4. Workspace / Empresa ────────────────────────────────────────────
  const { data: ws } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (ws) {
    setVal('contratada_razao_social', ws.company_legal_name || ws.company_name, 'empresa')
    setVal('contratada_cnpj',         ws.company_cnpj, 'empresa')
    setVal('contratada_cpf',          ws.company_cpf, 'empresa')
    const addrEmpresa = [
      ws.company_address_line, ws.company_address_city,
      ws.company_address_state, ws.company_address_zip,
    ].filter(Boolean).join(' — ')
    setVal('contratada_endereco', addrEmpresa, 'empresa')
    setVal('contratada_email',    ws.company_email, 'empresa')
    setVal('contratada_telefone', ws.company_phone, 'empresa')
    setVal('contratada_responsavel', ws.signature_name, 'empresa')

    setVal('cidade_foro',       ws.company_address_city, 'empresa')
    setVal('dias_aviso_previo', ws.default_cancellation_notice_days ? String(ws.default_cancellation_notice_days) : '', 'empresa')
    setVal('dias_aviso_previo_rescisao', ws.default_cancellation_notice_days ? String(ws.default_cancellation_notice_days) : '', 'empresa')
    setVal('pct_multa_cancelamento', ws.default_cancellation_penalty_pct ? String(ws.default_cancellation_penalty_pct) : '', 'empresa')
  }

  // ─── 5. Defaults razoáveis ──────────────────────────────────────────────
  setVal('data_assinatura', formatDatePtBr(new Date().toISOString()), 'sistema')
  setVal('dias_aviso_previo', '30', 'sistema')
  setVal('dias_aviso_previo_rescisao', '30', 'sistema')
  setVal('pct_multa_cancelamento', '50', 'sistema')
  setVal('horas_cobertura', '8', 'sistema')
  setVal('prazo_entrega', '30', 'sistema')
  setVal('direitos_uso', 'uso institucional, divulgação em mídias sociais e materiais promocionais da CONTRATANTE', 'sistema')
  setVal('exclusividade', 'A exclusividade deve ser acordada por escrito, não estando automaticamente implícita.', 'sistema')
  setVal('reajuste', 'Reajuste anual pelo IPCA, a contar da data de início.', 'sistema')
  setVal('confidencialidade', 'As informações compartilhadas no âmbito deste contrato são confidenciais.', 'sistema')

  // ─── Missing: placeholders esperados que continuaram vazios ──────────────
  const missing = meta.placeholders.filter(p => !values[p] || !values[p].trim())

  return {
    contractType: input.contractType,
    values,
    sourceLabels,
    missing,
  }
}

// ─── Helpers de formatação ────────────────────────────────────────────────

function formatDatePtBr(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    // date ISO (YYYY-MM-DD) ou timestamp
    const d = iso.length === 10
      ? new Date(`${iso}T12:00:00-03:00`)
      : new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

function formatBrl(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return ''
  const num = Number(n)
  if (isNaN(num)) return ''
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function translatePaymentCondition(cond: string): string {
  const map: Record<string, string> = {
    upfront: 'Pagamento integral na assinatura do contrato',
    '7d':    'Pagamento em até 7 dias corridos',
    '15d':   'Pagamento em até 15 dias corridos',
    '30d':   'Pagamento em até 30 dias corridos',
    '60d':   'Pagamento em até 60 dias corridos',
    '90d':   'Pagamento em até 90 dias corridos',
  }
  return map[cond] || cond
}

function translateFrequency(freq: string): string {
  const map: Record<string, string> = {
    weekly:    'semanal',
    monthly:   'mensal',
    quarterly: 'trimestral',
    yearly:    'anual',
  }
  return map[freq] || freq
}
