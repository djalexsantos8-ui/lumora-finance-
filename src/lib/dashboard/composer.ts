// ─── Composer · Dashboard Executivo ──────────────────────────────────────────
//
// Orquestrador único. Pega workspaceId, devolve TUDO: agregados + narrativa.
//
// RESPONSABILIDADE (mínima e explícita):
//   1) Buscar dados crus do Supabase (jobs, payments, expenses, fixed_costs).
//   2) Adaptar pro vocabulário do dashboard (Freelance, DashExpense, etc).
//   3) Rodar os 7 agregadores em ORDEM de dependência.
//   4) Rodar as 7 narrativas (1 por aba).
//   5) Devolver um envelope único: { agregados, narrativa }.
//
// NÃO FAZ:
//   · não altera nada em aggregators/ ou narrativa/
//   · não calcula lógica de negócio (cada coisa no seu lugar)
//   · não formata pra UI (narrativa já vem formatada)
//
// DESIGN:
//   · single entrypoint: getExecutiveDashboard(workspaceId, ref?)
//   · `ref` opcional (Date) — default = hoje; útil pra testes/preview
//   · pronto pra cache: o shape de entrada é (workspaceId, ref) → shape estável
//     de saída, então envolver em unstable_cache / React Cache é trivial depois
//   · os únicos side-effects moram em loadRaw() (4 queries ao Supabase)
//   · tudo depois disso é puro

import { createClient } from '@/lib/supabase/server'

import type { Job, JobPayment } from '@/types/job'
import type { Expense as LegacyExpense, FixedCost as LegacyFixedCost } from '@/types/expense'

import {
  toFreelance,
  toFreelancePayment,
  toDashExpense,
  toDashFixedCost,
  type Freelance,
  type FreelancePayment,
  type DashExpense,
  type DashFixedCost,
} from './types'

// ─── Agregadores ─────────────────────────────────────────────────────────────

import { calcInadimplencia, type InadimplenciaData } from './aggregators/inadimplencia'
import { calcVisaoGeral,    type VisaoGeralData    } from './aggregators/visao-geral'
import { calcReceita,       type ReceitaData       } from './aggregators/receita'
import { calcCustos,        type CustosData        } from './aggregators/custos'
import { calcClientes,      type ClientesData      } from './aggregators/clientes'
import { calcDiagnostico,   type DiagnosticoData   } from './aggregators/diagnostico'
import { calcConclusao,     type ConclusaoData     } from './aggregators/conclusao'

// ─── Narrativas ──────────────────────────────────────────────────────────────

import { calcNarrativaVisaoGeral    } from './narrativa/abas/visao-geral'
import { calcNarrativaInadimplencia } from './narrativa/abas/inadimplencia'
import { calcNarrativaReceita       } from './narrativa/abas/receita'
import { calcNarrativaCustos        } from './narrativa/abas/custos'
import { calcNarrativaClientes      } from './narrativa/abas/clientes'
import { calcNarrativaDiagnostico   } from './narrativa/abas/diagnostico'
import { calcNarrativaConclusao     } from './narrativa/abas/conclusao'

import type { AbaNarrativa } from './narrativa/types'

// ─── Saída ───────────────────────────────────────────────────────────────────

export interface ExecutiveAgregados {
  inadimplencia: InadimplenciaData
  visao_geral:   VisaoGeralData
  receita:       ReceitaData
  custos:        CustosData
  clientes:      ClientesData
  diagnostico:   DiagnosticoData
  conclusao:     ConclusaoData
}

export interface ExecutiveNarrativa {
  visao_geral:   AbaNarrativa
  inadimplencia: AbaNarrativa
  receita:       AbaNarrativa
  custos:        AbaNarrativa
  clientes:      AbaNarrativa
  diagnostico:   AbaNarrativa
  conclusao:     AbaNarrativa
}

export interface ExecutiveDashboard {
  agregados: ExecutiveAgregados
  narrativa: ExecutiveNarrativa
}

// ─── Fetch (única camada com side effect) ───────────────────────────────────

/**
 * Campos consumidos pelos adapters (toFreelance, toFreelancePayment,
 * toDashExpense, toDashFixedCost). Selecionamos exatamente o que os adapters
 * pedem via Pick, nada mais — fica barato de revisar.
 */
const JOB_FIELDS          = 'id,client_name,status,revenue_total,cost_total,total_value,amount_paid,payment_due_date,currency,is_multi_day,job_date,job_date_start'
const JOB_PAYMENT_FIELDS  = 'job_id,amount,received_at,currency'
const EXPENSE_FIELDS      = 'amount,amount_brl,description,category,expense_date,is_installment,is_paid'
const FIXED_COST_FIELDS   = 'amount,amount_brl,description,category,start_date,is_active,is_recurring,is_installment,is_paid'

interface RawData {
  jobs:       Job[]
  payments:   JobPayment[]
  expenses:   LegacyExpense[]
  fixedCosts: LegacyFixedCost[]
}

async function loadRaw(workspaceId: string): Promise<RawData> {
  const supabase = await createClient()

  // 4 queries em paralelo — única camada assíncrona de todo o composer.
  // Filtro deleted_at IS NULL em todas (soft delete consistente no schema).
  const [jobsRes, paymentsRes, expensesRes, fixedCostsRes] = await Promise.all([
    supabase
      .from('jobs')
      .select(JOB_FIELDS)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    supabase
      .from('job_payments')
      .select(JOB_PAYMENT_FIELDS),

    supabase
      .from('expenses')
      .select(EXPENSE_FIELDS)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    supabase
      .from('fixed_costs')
      .select(FIXED_COST_FIELDS)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
  ])

  return {
    jobs:       (jobsRes.data       ?? []) as Job[],
    payments:   (paymentsRes.data   ?? []) as JobPayment[],
    expenses:   (expensesRes.data   ?? []) as LegacyExpense[],
    fixedCosts: (fixedCostsRes.data ?? []) as LegacyFixedCost[],
  }
}

// ─── Adapters (Job → Freelance · Expense → DashExpense · etc) ───────────────

interface Adaptados {
  freelances:  Freelance[]
  payments:    FreelancePayment[]
  expenses:    DashExpense[]
  fixedCosts:  DashFixedCost[]
}

function adaptar(raw: RawData): Adaptados {
  return {
    freelances: raw.jobs.map(toFreelance),
    payments:   raw.payments.map(toFreelancePayment),
    expenses:   raw.expenses.map(toDashExpense),
    fixedCosts: raw.fixedCosts.map(toDashFixedCost),
  }
}

// ─── Agregação (ordem de dependência é SAGRADA aqui) ────────────────────────
//
// inadimplencia → alimenta taxa pra visao_geral
// visao_geral   → alimenta receita_mes + margem_pct pra custos
// receita       → independente de visao, depende só de freelances+payments
// custos        → depende de visao (receita_mes, margem)
// clientes      → independente (só freelances)
// diagnostico   → agrega os 5 anteriores
// conclusao     → agrega todos os 6 anteriores

function agregar(ad: Adaptados, today: string): ExecutiveAgregados {
  const inadimplencia = calcInadimplencia(ad.freelances, ad.payments, today)

  const visao_geral = calcVisaoGeral(
    ad.payments,
    ad.expenses,
    ad.fixedCosts,
    inadimplencia.taxa_pct,
    today,
  )

  const receita = calcReceita(ad.freelances, ad.payments, today)

  const custos = calcCustos(
    ad.expenses,
    ad.fixedCosts,
    visao_geral.receita_mes,
    visao_geral.margem_mes_pct,
    today,
  )

  const clientes = calcClientes(ad.freelances, today)

  const diagnostico = calcDiagnostico(
    inadimplencia,
    visao_geral,
    receita,
    custos,
    clientes,
  )

  const conclusao = calcConclusao(
    inadimplencia,
    visao_geral,
    receita,
    custos,
    clientes,
    diagnostico,
  )

  return { inadimplencia, visao_geral, receita, custos, clientes, diagnostico, conclusao }
}

// ─── Narrativa (consome só os agregados, NÃO fetch/raw) ─────────────────────

function narrar(a: ExecutiveAgregados): ExecutiveNarrativa {
  return {
    visao_geral:   calcNarrativaVisaoGeral(a.inadimplencia, a.visao_geral, a.receita, a.custos, a.clientes),
    inadimplencia: calcNarrativaInadimplencia(a.inadimplencia, a.visao_geral),
    receita:       calcNarrativaReceita(a.receita, a.clientes),
    custos:        calcNarrativaCustos(a.custos, a.receita),
    clientes:      calcNarrativaClientes(a.clientes, a.receita),
    diagnostico:   calcNarrativaDiagnostico(a.diagnostico),
    conclusao:     calcNarrativaConclusao(a.conclusao),
  }
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Calcula o Dashboard Executivo completo de um workspace.
 *
 * É o único ponto de entrada que a UI/Route precisa chamar. Side-effect só
 * mora no `loadRaw()` — toda a lógica de agregação e narrativa é pura, então
 * embrulhar isso em cache depois é só envolver a função numa camada.
 *
 * @param workspaceId   UUID do workspace
 * @param ref           Data de referência (default: hoje). Útil pra testes e
 *                      pra "voltar no tempo" visualizando meses anteriores.
 */
export async function getExecutiveDashboard(
  workspaceId: string,
  ref: Date = new Date(),
): Promise<ExecutiveDashboard> {
  const today = ref.toLocaleDateString('en-CA')   // YYYY-MM-DD no fuso local

  const raw        = await loadRaw(workspaceId)
  const adaptados  = adaptar(raw)
  const agregados  = agregar(adaptados, today)
  const narrativa  = narrar(agregados)

  return { agregados, narrativa }
}
