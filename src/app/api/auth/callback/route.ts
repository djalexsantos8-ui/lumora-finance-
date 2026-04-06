import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Recuperação de senha → redireciona para tela de nova senha (a criar)
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }

      // Cadastro confirmado → redireciona para o dashboard
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // Erro → volta para login com mensagem
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
