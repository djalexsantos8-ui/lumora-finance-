'use server'

// ─── auth actions ───────────────────────────────────────────────────────────
// Server actions relacionadas a autenticação. Só logout por enquanto —
// signup/login/reset ficam nas páginas próprias (/login, /signup, etc).

import { createClient } from '@/lib/supabase/server'

/**
 * Encerra a sessão do usuário atual.
 * Server action — chamada via onClick no componente sidebar.
 *
 * IMPORTANTE — não faz `redirect('/login')` aqui (Deploy H.6 2026-04-25):
 *   · No Next 16 + RSC streaming, `redirect()` dentro do server action faz o
 *     (app)/layout re-render imediatamente sem cookies → getUser() retorna
 *     null → layout chama redirect() de novo → race condition que cai no
 *     global-error mostrando "Erro inesperado" por ~1s antes da nav efetivar.
 *   · Solução: server limpa só os cookies (signOut), client faz hard navigate
 *     via window.location.href = '/login'. Sem ambiguidade de RSC streaming.
 *
 * Idempotente: se não houver sessão, apenas no-op.
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
