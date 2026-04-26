/**
 * Fonte única de versão do Lumora Finance.
 *
 * Toda UI que exibe versão (footer, admin shell, feedback widget, exports)
 * deve importar `APP_VERSION` daqui — nunca hardcodar.
 *
 * Convenção de bump:
 * - Patch (2.45 → 2.46): correções pequenas, ajustes de UX, copy, estilo.
 * - Minor (2.45 → 2.50): nova feature pequena, melhoria de fluxo.
 * - Major (2.45 → 3.00): feature grande, refatoração visível, mudança de modelo.
 *
 * O formato exibido é "versão beta vX.YY" até sairmos do beta.
 */
export const APP_VERSION = '2.45'
export const APP_BRAND = 'Lumora Solutions'
export const APP_STAGE = 'beta' as const

/** String canônica para o footer: "Criado por Lumora Solutions · versão beta v2.45" */
export const APP_FOOTER_LABEL =
  `Criado por ${APP_BRAND} · versão ${APP_STAGE} v${APP_VERSION}`

/**
 * Copyright dinâmico — ano sempre atual via runtime. Não hardcodar nunca.
 * Use em footer público (PDF, email, página landing).
 *
 * Render server-side: SSR já retorna ano correto sem hydration mismatch.
 * Em emails/PDFs (sem React), use `copyrightString()`.
 */
export function copyrightYear(): number {
  return new Date().getFullYear()
}

export function copyrightString(brand: string = APP_BRAND): string {
  return `© ${copyrightYear()} ${brand}`
}

/** Footer extendido com copyright + versão. */
export function appFooterFullLabel(): string {
  return `${copyrightString()} · ${APP_FOOTER_LABEL}`
}
