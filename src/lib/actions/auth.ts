'use server'

// ─── auth actions ───────────────────────────────────────────────────────────
// Server actions relacionadas a autenticação. Só logout por enquanto —
// signup/login/reset ficam nas páginas próprias (/login, /signup, etc).

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Encerra a sessão do usuário atual e redireciona para /login.
 * Server action — chamada via <form action={signOut}> no componente.
 * Idempotente: se não houver sessão, apenas redireciona.
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
