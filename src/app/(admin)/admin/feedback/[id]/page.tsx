import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Feedback, FeedbackAnalysis } from '@/types/feedback'
import {
  Panel,
  AudioPlayer,
  AttachmentViewer,
  PromptCopyBlock,
} from './detail-actions'

export const dynamic = 'force-dynamic'

export default async function FeedbackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('feedback')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) notFound()
  const fb = data as Feedback

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/feedback" className="text-xs text-[#a3a3a3] hover:text-white">
            ← Voltar para a inbox
          </Link>
          <h1 className="text-2xl font-bold mt-2">
            {fb.summary || (fb.raw_text ?? '').slice(0, 80) || 'Feedback'}
          </h1>
          <p className="text-xs text-[#737373] mt-1">
            {new Date(fb.created_at).toLocaleString('pt-BR')} ·
            {' '}de {fb.email ?? (fb.source === 'admin_manual' ? 'admin' : 'usuário')}
            {fb.source_page && <> · em <code className="bg-black/40 px-1 rounded">{fb.source_page}</code></>}
            {fb.app_version && <> · v{fb.app_version}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/admin/feedback/${fb.id}/export?format=md`}
            className="text-[11px] px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors"
            title="Exportar este feedback como Markdown"
          >
            ⬇ Markdown
          </a>
          <a
            href={`/api/admin/feedback/${fb.id}/export?format=pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors"
            title="Exportar este feedback como PDF (imprimir)"
          >
            ⬇ PDF
          </a>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Main content */}
        <div className="md:col-span-2 space-y-4">
          {/* Texto/transcrição */}
          <section className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4">
            <h2 className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-2">
              Conteúdo
            </h2>
            {fb.raw_text && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">Texto</div>
                <p className="text-sm text-white whitespace-pre-wrap">{fb.raw_text}</p>
              </div>
            )}
            {fb.audio_path && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">
                  Áudio · {fb.audio_duration_sec ? `${fb.audio_duration_sec}s` : 'duração desconhecida'}
                </div>
                <AudioPlayer id={fb.id} />
              </div>
            )}
            {fb.transcript && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">Transcrição</div>
                <p className="text-sm text-[#e5e5e5] whitespace-pre-wrap">{fb.transcript}</p>
              </div>
            )}
            {fb.attachment_path && (
              <div className="mt-3 pt-3 border-t border-[#1a1a1a]">
                <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">Anexo</div>
                <AttachmentViewer
                  id={fb.id}
                  filename={fb.attachment_filename}
                  mime={fb.attachment_mime}
                  sizeBytes={fb.attachment_size_bytes}
                />
              </div>
            )}
            {!fb.raw_text && !fb.transcript && !fb.audio_path && !fb.attachment_path && (
              <p className="text-sm text-[#737373]">(sem conteúdo)</p>
            )}
            {fb.transcription_status === 'pending' && (
              <p className="text-xs text-amber-400 mt-2">Transcrição em processamento…</p>
            )}
            {fb.transcription_status === 'failed' && (
              <p className="text-xs text-red-400 mt-2">
                Transcrição falhou: {fb.transcription_error ?? '—'}
              </p>
            )}
          </section>

          {/* Análise IA */}
          <section className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4">
            <h2 className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-2">
              Análise · IA
            </h2>
            {fb.analysis_status === 'pending' && (
              <p className="text-sm text-amber-400">Em análise…</p>
            )}
            {fb.analysis_status === 'failed' && (
              <p className="text-sm text-red-400">
                Análise falhou: {fb.analysis_error ?? '—'}
              </p>
            )}
            {fb.analysis_status === 'skipped' && (
              <p className="text-sm text-[#737373]">
                OpenAI não configurada — análise pulada. Configure a env e clique em reprocessar.
              </p>
            )}
            {fb.analysis_status === 'completed' && fb.analysis && (
              <AnalysisView analysis={fb.analysis} />
            )}
            {fb.analysis_status === 'completed' && !fb.analysis && (
              <p className="text-sm text-[#737373]">
                (análise marcada como concluída, mas payload está vazio — reanalise para gerar)
              </p>
            )}
          </section>
        </div>

        {/* Side: status + actions */}
        <aside className="space-y-4">
          <Panel feedback={fb} />

          <section className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 space-y-2 text-[11px] text-[#a3a3a3]">
            <h3 className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold">Metadados</h3>
            <div><span className="text-[#525252]">Tipo (user):</span> {fb.user_type ?? '—'}</div>
            <div><span className="text-[#525252]">Tipo (IA):</span> {fb.ai_type ?? '—'}</div>
            <div><span className="text-[#525252]">Severidade:</span> {fb.severity ?? '—'}</div>
            <div><span className="text-[#525252]">Score:</span> {fb.priority_score ?? '—'}</div>
            <div><span className="text-[#525252]">Bucket:</span> {fb.analysis?.bucket ?? '—'}</div>
            <div><span className="text-[#525252]">Tags:</span> {(fb.tags ?? []).join(', ') || '—'}</div>
            <div className="pt-2 border-t border-[#1a1a1a]">
              <div><span className="text-[#525252]">User-Agent:</span></div>
              <div className="text-[10px] break-all">{fb.user_agent ?? '—'}</div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

/**
 * Renderiza a análise IA de forma defensiva.
 *
 * Feedbacks legacy (pré-V2) não têm todos os campos — acessar direto
 * (sem fallback) explodia a página. Usamos `??` / guards em TODOS os campos.
 *
 * Também tolera `tags` ausente/não-array (JSONB vindo do banco pode variar).
 */
function AnalysisView({ analysis }: { analysis: FeedbackAnalysis }) {
  // Normalização defensiva
  const a = (analysis ?? {}) as Partial<FeedbackAnalysis>
  const resumo    = a.resumo ?? '—'
  const expl      = a.explicacao_humana ?? '—'
  const tech      = a.interpretacao_tecnica ?? '—'
  const acao      = a.sugestao_acao ?? '—'
  const proximo   = a.proximo_passo ?? '—'
  const area      = a.area_afetada ?? '—'
  const urgencia  = a.urgencia ?? '—'
  const bloqueia  = a.bloqueia_uso === true
  const score     = typeof a.priority_score === 'number' ? a.priority_score : null
  const justif    = a.priority_justificativa ?? ''
  const promptCC  = typeof a.prompt_cloud_code === 'string' && a.prompt_cloud_code.trim().length > 0
    ? a.prompt_cloud_code
    : null

  return (
    <div className="space-y-4 text-sm">
      <Field label="Resumo (1 linha)">{resumo}</Field>

      {/* Três camadas de interpretação */}
      <div className="space-y-3 pt-2 border-t border-[#1a1a1a]">
        <div className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold">
          Três camadas de interpretação
        </div>

        <div className="rounded-md border border-[#1a1a1a] bg-[#0a0a0a] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">
            1 · O que o usuário quis dizer
          </div>
          <div className="text-[13px] text-white whitespace-pre-wrap">{expl}</div>
        </div>

        <div className="rounded-md border border-[#1a1a1a] bg-[#0a0a0a] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">
            2 · O que isso provavelmente significa no código
          </div>
          <div className="text-[13px] text-white whitespace-pre-wrap">{tech}</div>
        </div>

        <div className="rounded-md border border-[#1a1a1a] bg-[#0a0a0a] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">
            3 · O que fazer a respeito
          </div>
          <div className="text-[13px] text-white whitespace-pre-wrap">{acao}</div>
        </div>
      </div>

      {/* Prompt Cloud Code */}
      {promptCC && (
        <div className="pt-2 border-t border-[#1a1a1a]">
          <PromptCopyBlock prompt={promptCC} />
        </div>
      )}

      {/* Próximo passo */}
      <Field label="Próximo passo (amanhã cedo)">
        <span className="text-[#D4A853]">{proximo}</span>
      </Field>

      <Field label="Área afetada">{area}</Field>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1a1a1a]">
        <Field label="Urgência">{urgencia}</Field>
        <Field label="Bloqueia uso?">{bloqueia ? '⛔ Sim' : 'Não'}</Field>
      </div>
      <Field label="Priority score">
        {score !== null ? (
          <>
            <span className="text-lg font-bold text-[#D4A853]">{score}</span>
            {justif && <span className="ml-2 text-[11px] text-[#737373]">{justif}</span>}
          </>
        ) : (
          <span className="text-[#737373]">—</span>
        )}
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-0.5">{label}</div>
      <div className="text-[13px] text-white">{children}</div>
    </div>
  )
}
