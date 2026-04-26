import Link from 'next/link'
import { requireWorkspace } from '@/lib/workspace/get-current-workspace'

/**
 * Landing /v2 — primeira tela ao entrar no dogfooding V2.
 *
 * Mostra status atual do workspace (plan, créditos IA, vagas) e atalhos
 * pras telas que já estão prontas. Cresce conforme epics ficam done.
 */
export default async function V2HomePage() {
  const { workspace, userId } = await requireWorkspace()

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <header>
        <div className="text-xs uppercase tracking-wider text-[#D4A853]/70">Lumora V2</div>
        <h1 className="mt-1 text-3xl font-bold text-white">{workspace.name}</h1>
        <p className="mt-2 text-sm text-[#a3a3a3]">
          Bem-vindo ao preview da V2. Aqui é onde a Lumora nova vive enquanto a V1 segue
          intocada em <Link href="/dashboard" className="underline hover:text-white">/dashboard</Link>.
        </p>
      </header>

      {/* Status workspace */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Plano" value={workspace.plan} accent="dourado" />
        <Card label="Vagas" value={`${workspace.maxUsers}`} sub="usuários máx." />
        <Card
          label="Créditos IA"
          value={`${workspace.aiCreditsRemaining}/${workspace.aiCreditsMonthly}`}
          sub="mês corrente"
        />
        <Card label="Seu papel" value={workspace.role} sub={`status: ${workspace.status}`} />
      </section>

      {/* Atalhos */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#D4A853]/70">
          Atalhos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ShortcutLink href="/admin/plano-implementacao" emoji="📋" label="Plano de Implementação" hint="painel admin V2" />
          <ShortcutLink href="/dashboard" emoji="🏠" label="Voltar pra V1" hint="ambiente em produção" />
        </div>
      </section>

      <div className="text-xs text-[#525252]">
        User: <code className="text-[#a3a3a3]">{userId.slice(0, 8)}…</code> · Workspace ID:{' '}
        <code className="text-[#a3a3a3]">{workspace.id.slice(0, 8)}…</code>
      </div>
    </div>
  )
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'dourado'
}) {
  const valueClass = accent === 'dourado' ? 'text-[#D4A853]' : 'text-white'
  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#525252]">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#525252]">{sub}</div>}
    </div>
  )
}

function ShortcutLink({
  href,
  emoji,
  label,
  hint,
}: {
  href: string
  emoji: string
  label: string
  hint?: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4 transition-colors hover:bg-[#161616]"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emoji}</span>
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          {hint && <div className="text-xs text-[#525252]">{hint}</div>}
        </div>
      </div>
    </Link>
  )
}
