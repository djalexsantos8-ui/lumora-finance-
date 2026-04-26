import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getProjectTypes } from '@/lib/v2/project-types'

export const dynamic = 'force-dynamic'

/**
 * Form de criação rápida — pede só nome (e opcional cliente + tipo).
 * Após criar, redireciona pro editor /v2/budgets/[id].
 */
export default async function NewBudgetV2Page() {
  const supabase = await createClient()

  const [{ data: clients }, projectTypes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
      .limit(200),
    getProjectTypes(),
  ])

  async function createBudget(formData: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) redirect('/login')

    const name        = String(formData.get('name') ?? '').trim() || 'Novo orçamento'
    const clientId    = String(formData.get('client_id') ?? '') || null
    const projectType = String(formData.get('project_type') ?? '') || null
    const otherText   = String(formData.get('project_type_other') ?? '').trim() || null

    // Resolve workspace ativo do user
    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!member) redirect('/v2/budgets?error=no_workspace')

    // Gera número via função SQL
    const { data: numberRes } = await sb
      .rpc('next_budget_number', { ws_id: member.workspace_id })

    const { data: budget, error } = await sb
      .from('budgets_v2')
      .insert({
        workspace_id:        member.workspace_id,
        number:              numberRes ?? 'ORC-2026-???',
        name,
        client_id:           clientId,
        project_type:        projectType,
        project_type_other:  projectType === 'outro' ? otherText : null,
        status:              'draft',
        created_by:          user.id,
      })
      .select('id')
      .single()

    if (error || !budget) {
      redirect('/v2/budgets?error=create_failed')
    }

    redirect(`/v2/budgets/${budget.id}`)
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Link
        href="/v2/budgets"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white"
      >
        ← Voltar
      </Link>

      <h1 className="mb-2 text-2xl font-bold text-white">Novo orçamento</h1>
      <p className="mb-8 text-sm text-[#737373]">
        Comece simples — depois você adiciona itens, datas e detalhes no editor.
      </p>

      <form action={createBudget} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#a3a3a3]">
            Nome do projeto
          </label>
          <input
            type="text"
            name="name"
            required
            placeholder="Casamento João & Maria — 15/06"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2.5 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#a3a3a3]">
            Cliente <span className="text-[#525252]">(opcional)</span>
          </label>
          <select
            name="client_id"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2.5 text-sm text-white focus:border-[#D4A853] focus:outline-none"
          >
            <option value="">— sem cliente —</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#a3a3a3]">
            Tipo de projeto <span className="text-[#525252]">(opcional)</span>
          </label>
          <select
            name="project_type"
            defaultValue=""
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2.5 text-sm text-white focus:border-[#D4A853] focus:outline-none"
          >
            <option value="">— escolha o tipo —</option>
            {projectTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="project_type_other"
            placeholder='Se "Outro", descreva aqui'
            className="mt-2 w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-xs text-[#a3a3a3] placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-[#D4A853] px-4 py-3 text-sm font-semibold text-black hover:bg-[#e0b95f] transition-colors"
        >
          Criar orçamento →
        </button>
      </form>
    </div>
  )
}
