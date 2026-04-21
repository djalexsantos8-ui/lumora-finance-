// ─── Dashboard Executivo · Client Wrapper ───────────────────────────────────
//
// Estado de aba ativa + renderização da pane correspondente. Puro client.
// Recebe o envelope completo { agregados, narrativa } do server.

'use client'

import { useState } from 'react'
import type { ExecutiveDashboard } from '@/lib/dashboard/composer'

import { TabNav, type AbaKey } from '@/components/dashboard-executivo/tab-nav'
import {
  PaneVisaoGeral,
  PaneInadimplencia,
  PaneReceita,
  PaneCustos,
  PaneClientes,
  PaneDiagnostico,
} from '@/components/dashboard-executivo/panes'
import { DashboardClassicoPane } from '@/components/dashboard-classico/pane'

interface Props {
  data: ExecutiveDashboard
}

export function DashboardExecutivoClient({ data }: Props) {
  const [aba, setAba] = useState<AbaKey>('visao_geral')

  const { agregados, narrativa } = data

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-[#525252] mb-1">
            Dashboard Executivo
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Seu mês em 30 segundos
          </h1>
          <p className="text-sm text-[#a3a3a3] mt-1 max-w-2xl">
            Cada aba responde uma pergunta prática. Os números vêm acompanhados
            da explicação — você não precisa saber ler dashboard pra entender.
          </p>
        </div>
      </header>

      {/* Navegação */}
      <TabNav active={aba} onChange={setAba} />

      {/* Pane ativa */}
      <main className="min-h-[60vh]">
        {aba === 'visao_geral'   && <PaneVisaoGeral   agregados={agregados} narrativa={narrativa} />}
        {aba === 'inadimplencia' && <PaneInadimplencia agregados={agregados} narrativa={narrativa} />}
        {aba === 'receita'       && <PaneReceita       agregados={agregados} narrativa={narrativa} />}
        {aba === 'custos'        && <PaneCustos        agregados={agregados} narrativa={narrativa} />}
        {aba === 'clientes'      && <PaneClientes      agregados={agregados} narrativa={narrativa} />}
        {aba === 'diagnostico'   && <PaneDiagnostico   agregados={agregados} narrativa={narrativa} />}
        {aba === 'conclusao'     && <DashboardClassicoPane />}
      </main>
    </div>
  )
}
