'use client'

/**
 * global-error — último recurso do Next.js quando até o root layout quebra.
 * Precisa renderizar <html>/<body> próprios porque o layout raiz falhou.
 */

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 440, width: '100%', background: '#111', border: '1px solid #1f1f1f', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 0 }}>Erro inesperado</h2>
            <p style={{ fontSize: 12, color: '#8a8a8a', marginTop: 4 }}>
              Algo travou o carregamento. Tente recarregar a página.
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, color: '#525252', marginTop: 12 }}>
                ID: <span style={{ color: '#D4A853' }}>{error.digest}</span>
              </p>
            )}
            <button
              onClick={() => reset()}
              style={{
                marginTop: 16,
                background: '#D4A853',
                color: '#000',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
