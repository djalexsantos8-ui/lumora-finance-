import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Executa em todas as rotas EXCETO:
     * - _next/static  (assets do Next.js)
     * - _next/image   (otimizações de imagem)
     * - favicon.ico
     * - arquivos estáticos com extensão (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
}
