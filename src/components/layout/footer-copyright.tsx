import { APP_BRAND, APP_VERSION, APP_STAGE, copyrightYear } from '@/lib/app-version'

/**
 * Copyright dinâmico reusável — ano sempre via runtime (SSR).
 * Marca jurídica: APP_BRAND = "Lumora Solutions" (não "Lumora Finance").
 *
 * Variantes:
 *   - minimal: "© 2026 Lumora Solutions"
 *   - auth:    "© 2026 Lumora Solutions. Todos os direitos reservados." (centralizado, pra /login, /signup, /upgrade)
 *   - full:    rodapé estendido com Termos · Privacidade · versão (pra landing/admin)
 *
 * Uso:
 *   <FooterCopyright variant="auth" />
 *   <FooterCopyright variant="full" showVersion showLinks />
 */

interface Props {
  variant?: 'minimal' | 'auth' | 'full'
  showVersion?: boolean
  showLinks?: boolean
  className?: string
}

export function FooterCopyright({
  variant = 'minimal',
  showVersion = false,
  showLinks = false,
  className = '',
}: Props) {
  const year = copyrightYear()

  if (variant === 'minimal') {
    return (
      <span className={`text-xs text-[#525252] ${className}`}>
        © {year} {APP_BRAND}
      </span>
    )
  }

  if (variant === 'auth') {
    return (
      <p className={`text-center text-[#525252] text-xs mt-6 ${className}`}>
        © {year} {APP_BRAND}. Todos os direitos reservados.
      </p>
    )
  }

  return (
    <footer
      className={`flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#525252] py-6 px-4 ${className}`}
      role="contentinfo"
    >
      <span>© {year} {APP_BRAND} · Todos os direitos reservados.</span>
      <div className="flex items-center gap-3">
        {showLinks && (
          <>
            <a href="/termos" className="hover:text-[#a3a3a3]">Termos</a>
            <a href="/privacidade" className="hover:text-[#a3a3a3]">Privacidade</a>
          </>
        )}
        {showVersion && (
          <span className="text-[10px] opacity-70">
            versão {APP_STAGE} v{APP_VERSION}
          </span>
        )}
      </div>
    </footer>
  )
}
