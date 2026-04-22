import { APP_FOOTER_LABEL } from '@/lib/app-version'

/**
 * Footer global que aparece em todas as rotas autenticadas ((app) e (admin)).
 * A versão vem de `src/lib/app-version.ts` — fonte única.
 */
export default function AppFooter() {
  return (
    <footer
      className="mt-auto border-t border-[#1a1a1a] bg-[#0a0a0a]/60 px-6 py-3"
      role="contentinfo"
    >
      <p className="text-center text-[11px] text-[#525252] tracking-wide">
        {APP_FOOTER_LABEL}
      </p>
    </footer>
  )
}
