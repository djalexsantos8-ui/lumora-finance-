import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BudgetEditor from '../[id]/budget-editor'
import type { Budget } from '@/types/budget'
import type { Freelancer } from '@/types/freelancer'

export const metadata = { title: 'Novo Orçamento — Lumora Finance' }

// ─── PÁGINA "NOVO ORÇAMENTO" — entrada optimistic ─────────────────────────────
//
// Este endpoint é o destino do botão "Novo Orçamento". Ele renderiza o editor
// VAZIO, SEM criar registro no banco. O INSERT só acontece no primeiro auto-save
// via createBudget(fields) — se o usuário sair sem digitar nada, zero drafts
// vazios ficam no DB (resolve o lixo dos 82 rascunhos R$0,00).
//
// Por que servidor e não client? Precisamos:
//   · checar auth (redirect /login se não logado)
//   · carregar freelancers (usado no modal de itens)
// Ambos são <50ms somados — o ganho percebido vem do Link prefetch no botão.
export default async function NewBudgetPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Freelancers do workspace — a RLS já filtra pelo workspace do usuário logado.
  // Query única e leve (sem budget, sem items) pra manter essa rota rápida.
  const { data: freelancersData } = await supabase
    .from('freelancers')
    .select('id, name, role, daily_rate, currency, workspace_id')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  const freelancers = (freelancersData ?? []) as Freelancer[]

  // Deploy E → Hotfix 2026-04-22 23:30 (pós-hang em prod): getAIQuota
  // movido PRA FORA do SSR. O AIFieldsCard busca a quota no cliente via
  // getMyAIQuota() no mount (useEffect Deploy G). Remover do SSR elimina
  // qualquer risco de timeout/hang no stream de Suspense.

  // Budget "stub" — usado apenas pra alimentar o estado inicial do editor.
  // O id vazio sinaliza "ainda não existe no banco" (modo isNew). No primeiro
  // save, createBudget() devolve o id real e o editor faz replaceState na URL.
  const stubBudget: Budget = {
    id:                  '',
    workspace_id:        '',
    created_by:          user.id,
    title:               '',
    client_name:         '',
    // Deploy A: novos campos canônicos (nullable até o user preencher)
    client_id:           null,
    segment:             null,
    lead_source:         null,
    project_description: null,
    deliverables:        null,
    event_date:          null,
    event_date_end:      null,
    is_multi_day:        false,
    valid_until:         null,
    status:              'draft',
    currency:            'BRL',
    subtotal:            0,
    margin_type:         'percentage',
    margin_input:        0,
    margin_amount:       0,
    discount_amount:     0,
    total:               0,
    notes_internal:      null,
    payment_term:        null,
    intended_destination: null,
    sent_at:             null,
    approved_at:         null,
    deleted_at:          null,
    created_at:          new Date().toISOString(),
    updated_at:          new Date().toISOString(),
  }

  return (
    <BudgetEditor
      budget={stubBudget}
      items={[]}
      freelancers={freelancers}
      isNew
      initialAIQuota={null}
    />
  )
}
