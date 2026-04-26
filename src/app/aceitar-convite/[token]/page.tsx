import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import AcceptInviteButton from './accept-button'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

interface InvitePayload {
  id:               string
  email:            string
  role:             string
  workspace_id:     string
  workspace_name:   string
  invited_by_email: string | null
  message:          string | null
  expires_at:       string
  accepted_at:      string | null
  revoked_at:       string | null
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params

  // RPC tolera anon — só lookup
  const admin = createAdminClient()
  const { data } = await admin.rpc('get_invite_by_token', { p_token: token })

  if (!data) notFound()
  const invite = data as InvitePayload

  // Estados terminais
  if (invite.accepted_at) {
    return (
      <Wrap title="Convite já aceito" tone="info">
        Este link já foi usado. Acesse o workspace pelo dashboard.
        <div className="mt-6">
          <Link href="/v2" className="rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f]">
            Ir pro dashboard
          </Link>
        </div>
      </Wrap>
    )
  }
  if (invite.revoked_at) {
    return <Wrap title="Convite revogado" tone="error">Este link foi cancelado pelo workspace owner.</Wrap>
  }
  if (new Date(invite.expires_at) < new Date()) {
    return <Wrap title="Convite expirado" tone="error">O prazo de 7 dias acabou. Peça um novo convite ao owner.</Wrap>
  }

  // Logado?
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  if (!user) {
    const next = encodeURIComponent(`/aceitar-convite/${token}`)
    return (
      <Wrap title={`${invite.invited_by_email ?? 'Alguém'} te convidou`} tone="ok">
        Você foi convidado pra entrar em <strong className="text-white">{invite.workspace_name}</strong>{' '}
        no Lumora.
        {invite.message ? (
          <blockquote className="mt-3 rounded border-l-2 border-[#D4A853]/40 bg-[#0d0d0d] px-3 py-2 text-sm italic text-[#a3a3a3]">
            “{invite.message}”
          </blockquote>
        ) : null}
        <p className="mt-4 text-xs text-[#737373]">
          Faça login com <span className="text-white">{invite.email}</span> pra aceitar.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/login?next=${next}`}
            className="rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f]"
          >
            Entrar
          </Link>
          <Link
            href={`/signup?next=${next}`}
            className="text-sm text-[#a3a3a3] hover:text-white"
          >
            ou criar conta
          </Link>
        </div>
      </Wrap>
    )
  }

  // Email mismatch
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Wrap title="Email diferente" tone="error">
        Este convite é pra <span className="text-white">{invite.email}</span>, mas você está logado como{' '}
        <span className="text-white">{user.email}</span>.
        <p className="mt-3 text-xs text-[#737373]">
          Saia e entre com a conta correta pra aceitar.
        </p>
        <div className="mt-4">
          <Link href="/login" className="text-sm text-[#D4A853] hover:underline">
            Fazer logout e trocar conta →
          </Link>
        </div>
      </Wrap>
    )
  }

  // Tudo ok — botão de aceitar
  return (
    <Wrap title={`Bem-vindo a ${invite.workspace_name}`} tone="ok">
      Você foi convidado por <span className="text-white">{invite.invited_by_email ?? 'workspace owner'}</span>{' '}
      pra entrar em <span className="text-white">{invite.workspace_name}</span>.
      {invite.message ? (
        <blockquote className="mt-3 rounded border-l-2 border-[#D4A853]/40 bg-[#0d0d0d] px-3 py-2 text-sm italic text-[#a3a3a3]">
          “{invite.message}”
        </blockquote>
      ) : null}
      <div className="mt-6">
        <AcceptInviteButton token={token} workspaceName={invite.workspace_name} />
      </div>
    </Wrap>
  )
}

function Wrap({
  title, tone, children,
}: {
  title:    string
  tone:     'ok' | 'info' | 'error'
  children: React.ReactNode
}) {
  const accent =
    tone === 'error' ? 'border-red-500/30 bg-red-500/5'
    : tone === 'info' ? 'border-blue-500/30 bg-blue-500/5'
    : 'border-[#D4A853]/30 bg-[#D4A853]/5'

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full">
        <div className="mb-6 text-center">
          <span className="text-xs uppercase tracking-wider text-[#D4A853]">LUMORA</span>
        </div>
        <div className={`rounded-2xl border p-6 ${accent}`}>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <div className="mt-3 text-sm text-[#a3a3a3] leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}
