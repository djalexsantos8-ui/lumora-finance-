import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtBRL } from '@/lib/v2/budget-calc'
import {
  FUNCOES_PRINCIPAIS, disponibilidadeLabel, funcaoLabel,
} from '@/lib/v2/freelancer-constants'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ funcao?: string; q?: string }>
}

export default async function FreelancersListPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('freelancers_v2')
    .select('id, display_name, nome_completo, nome_artistico, instagram, funcao_principal, skills, cidade, uf, tarifa_diaria, disponibilidade, rating, foto_url')
    .order('display_name', { ascending: true })
    .limit(200)

  if (params.funcao) {
    query = query.eq('funcao_principal', params.funcao)
  }
  if (params.q) {
    const q = params.q.replace(/[%_]/g, '\\$&')
    query = query.or(`display_name.ilike.%${q}%,nome_completo.ilike.%${q}%,nome_artistico.ilike.%${q}%,instagram.ilike.%${q}%`)
  }

  const { data: list } = await query
  const freelas = list ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Freelancers</h1>
          <p className="text-sm text-[#737373]">
            Sua rede de confiança — {freelas.length} cadastrado{freelas.length === 1 ? '' : 's'}.
          </p>
        </div>
        <Link
          href="/v2/freelancers/new"
          className="inline-flex items-center gap-2 rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f] transition-colors"
        >
          + Novo freelancer
        </Link>
      </div>

      {/* Filtros */}
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
            Buscar
          </label>
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Nome, @instagram, nome artístico…"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
            Função
          </label>
          <select
            name="funcao"
            defaultValue={params.funcao ?? ''}
            className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm text-white focus:border-[#D4A853] focus:outline-none"
          >
            <option value="">Todas</option>
            {FUNCOES_PRINCIPAIS.map((f) => (
              <option key={f.value} value={f.value}>{f.icon} {f.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-2 text-sm text-white hover:bg-[#161616]"
        >
          Filtrar
        </button>
        {(params.funcao || params.q) && (
          <Link
            href="/v2/freelancers"
            className="text-xs text-[#737373] hover:text-white"
          >
            Limpar filtros
          </Link>
        )}
      </form>

      {/* Lista */}
      {freelas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] p-12 text-center">
          <div className="mb-3 text-5xl">👥</div>
          <h2 className="mb-2 text-lg font-semibold text-white">
            {params.q || params.funcao ? 'Nenhum resultado' : 'Sua rede ainda está vazia'}
          </h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-[#737373]">
            {params.q || params.funcao
              ? 'Tente outro termo ou limpe os filtros.'
              : 'Cadastre operadores, assistentes, editores, drone-pilots, makeup. Quando montar uma diária, filtra em segundos.'}
          </p>
          {!(params.q || params.funcao) && (
            <Link
              href="/v2/freelancers/new"
              className="inline-flex items-center gap-2 rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f] transition-colors"
            >
              Adicionar primeiro freelancer →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {freelas.map((f) => {
            const fn = funcaoLabel(f.funcao_principal)
            return (
              <Link
                key={f.id}
                href={`/v2/freelancers/${f.id}`}
                className="block rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4 hover:bg-[#111] transition-colors"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{fn.icon}</span>
                      <span className="font-semibold text-white truncate">
                        {f.display_name}
                      </span>
                    </div>
                    {f.nome_artistico && f.nome_artistico !== f.display_name ? (
                      <div className="text-[11px] text-[#737373] truncate">
                        {f.nome_completo}
                      </div>
                    ) : null}
                  </div>
                  {f.rating ? (
                    <span className="shrink-0 text-xs text-amber-400" title={`${f.rating}/5`}>
                      {'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}
                    </span>
                  ) : null}
                </div>

                <div className="text-[11px] text-[#a3a3a3]">{fn.label}</div>
                {(f.cidade || f.uf) ? (
                  <div className="text-[11px] text-[#737373]">
                    📍 {[f.cidade, f.uf].filter(Boolean).join('/')}
                  </div>
                ) : null}

                {f.skills && f.skills.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(f.skills as string[]).slice(0, 4).map((s: string, i: number) => (
                      <span
                        key={i}
                        className="rounded border border-[#2a2a2a] bg-[#111] px-1.5 py-0.5 text-[10px] text-[#a3a3a3]"
                      >
                        {s}
                      </span>
                    ))}
                    {f.skills.length > 4 ? (
                      <span className="text-[10px] text-[#525252]">+{f.skills.length - 4}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#737373]">
                    {disponibilidadeLabel(f.disponibilidade)}
                  </span>
                  {f.tarifa_diaria ? (
                    <span className="font-mono text-[#D4A853]">
                      {fmtBRL(Number(f.tarifa_diaria))}/dia
                    </span>
                  ) : null}
                </div>

                {f.instagram ? (
                  <div className="mt-1 text-[11px] text-[#525252]">@{f.instagram}</div>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
