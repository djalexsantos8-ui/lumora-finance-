'use server'

// ─── Onboarding · Server Actions ────────────────────────────────────────────
//
// Quatro actions principais do fluxo de primeiro acesso:
//
//   · saveCompanyProfile     → salva dados da empresa (Etapa 2)
//   · markOnboardingCompleted → marca onboarding como finalizado (após o tour)
//   · markOnboardingSkipped   → pulou — não travar, não reaparecer insistindo
//   · replayTour              → reseta SÓ o tour (mantém dados da empresa)
//
// Decisões de modelagem:
//   1. Empresa (company_*) mora em workspace_settings — é compartilhada por todos
//      do workspace. Um workspace = uma empresa.
//   2. Estado do onboarding (completed/skipped/tour_at) mora em profiles.id (= user).
//      Cada usuário tem seu próprio ciclo. Assim um novo membro de workspace existente
//      ainda vê o tour na sua primeira entrada.
//   3. `onboarding_completed` (boolean) é a fonte de verdade binária do gate.
//      Os `*_at` são granularidade auxiliar pra analytics/UX fina.
//
// Segurança: todas as actions exigem auth e usam workspace_id derivado do user.
// Nunca aceitamos workspace_id do cliente.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getActiveWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}

// ─── tipos públicos ──────────────────────────────────────────────────────────

export interface CompanyProfilePayload {
  // Identidade
  company_name?:        string | null
  company_trade_name?:  string | null
  company_legal_name?:  string | null
  company_cnpj?:        string | null
  company_cpf?:         string | null
  company_logo_url?:    string | null
  // Contato
  company_email?:       string | null
  company_phone?:       string | null
  company_website?:     string | null
  company_instagram?:   string | null
  // Endereço
  company_address_line?:  string | null
  company_address_city?:  string | null
  company_address_state?: string | null
  company_address_zip?:   string | null
  // Fiscais (opcionais)
  company_municipal_registration?: string | null
  company_state_registration?:     string | null
  company_tax_regime?:             string | null
  company_billing_notes?:          string | null
}

export type OnboardingActionResult =
  | { success: true }
  | { success: false; message: string }

// Normaliza strings vindas do form: trim + "" → null.
function norm(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t ? t : null
}

// ─── SAVE COMPANY PROFILE ───────────────────────────────────────────────────
//
// Upsert em workspace_settings. Marca `onboarding_company_at` no profile.
// NÃO marca `onboarding_completed` ainda — isso acontece depois do tour
// (ou quando o usuário pular).

export async function saveCompanyProfile(
  payload: CompanyProfilePayload
): Promise<OnboardingActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const row = {
    workspace_id:                   workspaceId,
    company_name:                   norm(payload.company_name),
    company_trade_name:             norm(payload.company_trade_name),
    company_legal_name:             norm(payload.company_legal_name),
    company_cnpj:                   norm(payload.company_cnpj),
    company_cpf:                    norm(payload.company_cpf),
    company_logo_url:               norm(payload.company_logo_url),
    company_email:                  norm(payload.company_email),
    company_phone:                  norm(payload.company_phone),
    company_website:                norm(payload.company_website),
    company_instagram:              norm(payload.company_instagram),
    company_address_line:           norm(payload.company_address_line),
    company_address_city:           norm(payload.company_address_city),
    company_address_state:          norm(payload.company_address_state),
    company_address_zip:            norm(payload.company_address_zip),
    company_municipal_registration: norm(payload.company_municipal_registration),
    company_state_registration:     norm(payload.company_state_registration),
    company_tax_regime:             norm(payload.company_tax_regime),
    company_billing_notes:          norm(payload.company_billing_notes),
  }

  const { error: upsertErr } = await supabase
    .from('workspace_settings')
    .upsert(row, { onConflict: 'workspace_id' })

  if (upsertErr) {
    console.error('[onboarding/saveCompanyProfile] upsert erro:', upsertErr.message)
    return { success: false, message: 'Erro ao salvar dados da empresa.' }
  }

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ onboarding_company_at: new Date().toISOString() })
    .eq('id', user.id)

  if (profErr) {
    // Não-fatal: dados foram salvos. Apenas loga.
    console.warn('[onboarding/saveCompanyProfile] profile timestamp erro:', profErr.message)
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── MARK COMPLETED ──────────────────────────────────────────────────────────
//
// Usuário terminou o tour. Seta `onboarding_completed=true` + timestamp do tour.

export async function markOnboardingCompleted(): Promise<OnboardingActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: true,
      onboarding_tour_at:   new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/markCompleted]', error.message)
    return { success: false, message: 'Erro ao concluir onboarding.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── MARK SKIPPED ────────────────────────────────────────────────────────────
//
// Usuário pulou (clicou "Pular" ou fechou X). Marca como completed=true
// pra não reaparecer chato, mas registra o skipped_at pra analytics e pra
// podermos oferecer re-abertura educada em Settings.

export async function markOnboardingSkipped(): Promise<OnboardingActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: true,
      onboarding_skipped_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/markSkipped]', error.message)
    return { success: false, message: 'Erro ao pular onboarding.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── REPLAY TOUR ─────────────────────────────────────────────────────────────
//
// Reseta SÓ o tour — permite o usuário rever o guia. Mantém `onboarding_completed`
// true (ou reseta pra false, daí reaparece no próximo login). Decisão: reseta
// completed pra false E limpa tour_at, pra o overlay voltar a aparecer uma vez.
// Não limpa company_at — dados da empresa já foram preenchidos.

export async function replayTour(): Promise<OnboardingActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: false,
      onboarding_tour_at:   null,
      onboarding_skipped_at: null,
    })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/replayTour]', error.message)
    return { success: false, message: 'Erro ao reabrir tour.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
