'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { ok: false; error: string }

export interface FreelancerInput {
  // Identidade
  nome_completo:        string
  nome_artistico?:      string | null
  display_name?:        string | null
  cpf?:                 string | null
  data_nascimento?:     string | null

  // Contato
  email?:               string | null
  telefone?:            string | null
  whatsapp?:            string | null
  instagram?:           string | null
  vimeo_url?:           string | null
  portfolio_url?:       string | null

  // Função
  funcao_principal:     string
  funcoes_secundarias?: string[]
  skills?:              string[]
  experiencia_anos?:    number | null

  // Tarifa
  tarifa_diaria?:       number | null
  tarifa_hora?:         number | null

  // Logística
  cidade?:              string | null
  uf?:                  string | null
  disponibilidade?:     string | null
  restricao_alimentar?: string | null
  restricao_alimentar_detalhe?: string | null
  tem_carro?:           boolean
  tem_cnh?:             boolean

  // Equipamento
  equipamento_proprio?: string | null
  equipamento_disponivel_para_emprestimo?: boolean

  // Pagamento
  pix_chave?:           string | null
  banco_nome?:          string | null
  banco_agencia?:       string | null
  banco_conta?:         string | null
  banco_tipo?:          string | null

  // Notas
  notes?:               string | null
  rating?:              number | null
  tags?:                string[]
}

export async function createFreelancer(input: FreelancerInput): Promise<void> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Resolve workspace ativo
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!member) redirect('/v2/freelancers?error=no_workspace')

  const display = input.display_name?.trim()
    || input.nome_artistico?.trim()
    || input.nome_completo.trim().split(' ')[0]

  const { data, error } = await sb
    .from('freelancers_v2')
    .insert({
      workspace_id:        member.workspace_id,
      nome_completo:       input.nome_completo.trim(),
      nome_artistico:      input.nome_artistico ?? null,
      display_name:        display,
      cpf:                 input.cpf ?? null,
      data_nascimento:     input.data_nascimento ?? null,
      email:               input.email ?? null,
      telefone:            input.telefone ?? null,
      whatsapp:            input.whatsapp ?? null,
      instagram:           input.instagram?.replace(/^@/, '') ?? null,
      vimeo_url:           input.vimeo_url ?? null,
      portfolio_url:       input.portfolio_url ?? null,
      funcao_principal:    input.funcao_principal,
      funcoes_secundarias: input.funcoes_secundarias ?? [],
      skills:              input.skills ?? [],
      experiencia_anos:    input.experiencia_anos ?? null,
      tarifa_diaria:       input.tarifa_diaria ?? null,
      tarifa_hora:         input.tarifa_hora ?? null,
      cidade:              input.cidade ?? null,
      uf:                  input.uf ?? null,
      disponibilidade:     input.disponibilidade ?? null,
      restricao_alimentar: input.restricao_alimentar ?? null,
      restricao_alimentar_detalhe: input.restricao_alimentar_detalhe ?? null,
      tem_carro:           Boolean(input.tem_carro),
      tem_cnh:             Boolean(input.tem_cnh),
      equipamento_proprio: input.equipamento_proprio ?? null,
      equipamento_disponivel_para_emprestimo: Boolean(input.equipamento_disponivel_para_emprestimo),
      pix_chave:           input.pix_chave ?? null,
      banco_nome:          input.banco_nome ?? null,
      banco_agencia:       input.banco_agencia ?? null,
      banco_conta:         input.banco_conta ?? null,
      banco_tipo:          input.banco_tipo ?? null,
      notes:               input.notes ?? null,
      rating:              input.rating ?? null,
      tags:                input.tags ?? [],
    })
    .select('id')
    .single()

  if (error || !data) redirect('/v2/freelancers?error=create_failed')
  revalidatePath('/v2/freelancers')
  redirect(`/v2/freelancers/${data.id}`)
}

export async function updateFreelancer(
  id: string,
  patch: Partial<FreelancerInput>
): Promise<ActionResult> {
  const sb = await createClient()
  const payload: Record<string, unknown> = { ...patch }
  if (typeof patch.instagram === 'string') {
    payload.instagram = patch.instagram.replace(/^@/, '')
  }
  const { error } = await sb.from('freelancers_v2').update(payload).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/v2/freelancers/${id}`)
  revalidatePath('/v2/freelancers')
  return { ok: true }
}

export async function deleteFreelancer(id: string): Promise<ActionResult> {
  const sb = await createClient()
  const { error } = await sb.from('freelancers_v2').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/v2/freelancers')
  return { ok: true }
}
