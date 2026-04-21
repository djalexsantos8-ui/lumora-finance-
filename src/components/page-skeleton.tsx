// ─── PageSkeleton — placeholder padrão pra loading.tsx ───────────────────────
//
// Pente fino 2026-04-21 (performance): Next carrega o RSC em streaming, mas
// sem loading.tsx o usuário vê a página branca até o servidor terminar. Com
// um skeleton simples e leve, a percepção de latência cai drasticamente
// (mesmo quando o tempo real é o mesmo).
//
// Mantemos a API mínima: apenas um array de "blocos" pra compor qualquer
// tela (KPIs no topo + listagem + sidebar, etc.).

export interface SkeletonShape {
  kind:    'row' | 'card' | 'grid' | 'kpi'
  count?:  number   // pra 'row' e 'kpi'
  cols?:   number   // pra 'grid' (default 3)
  height?: string   // tailwind h-* class, ex.: 'h-20'
}

export default function PageSkeleton({
  title,
  description,
  shapes,
}: {
  title?:       string
  description?: string
  shapes:       SkeletonShape[]
}) {
  return (
    <div className="min-h-full p-6 md:p-8 space-y-6 animate-pulse">
      {/* Cabeçalho */}
      {(title || description) && (
        <div className="space-y-2">
          {title && (
            <div className="h-6 w-48 bg-[#1c1c1c] rounded-lg" />
          )}
          {description && (
            <div className="h-3 w-64 bg-[#141414] rounded" />
          )}
        </div>
      )}

      {shapes.map((s, idx) => {
        if (s.kind === 'kpi') {
          const count = s.count ?? 4
          return (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-3">
                  <div className="h-3 w-16 bg-[#1c1c1c] rounded" />
                  <div className="h-6 w-24 bg-[#1c1c1c] rounded" />
                </div>
              ))}
            </div>
          )
        }

        if (s.kind === 'card') {
          return (
            <div
              key={idx}
              className={`bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 ${s.height ?? 'h-48'}`}
            />
          )
        }

        if (s.kind === 'grid') {
          const cols = s.cols ?? 3
          const count = s.count ?? cols * 2
          return (
            <div
              key={idx}
              className={`grid gap-4`}
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className={`bg-[#141414] border border-[#2a2a2a] rounded-2xl ${s.height ?? 'h-28'}`}
                />
              ))}
            </div>
          )
        }

        // row (lista vertical)
        const count = s.count ?? 5
        return (
          <div key={idx} className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className={`bg-[#141414] border border-[#2a2a2a] rounded-xl ${s.height ?? 'h-14'}`}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
