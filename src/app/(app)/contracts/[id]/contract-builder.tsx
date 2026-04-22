'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { updateContract, deleteContract } from '@/lib/actions/contracts'
import type { Contract, ContractStatus, ContractTypeMeta } from '@/types/contract'

// ─── Contract Builder ───────────────────────────────────────────────────────
//
// UI com 3 colunas visuais:
//  · Esquerda  — metadados (título, tipo, status, origem, notas internas)
//  · Centro    — lista de placeholders com inputs + origem de cada valor
//  · Direita   — prévia do contrato renderizado (markdown → texto)
//
// Fluxo: usuário altera um override → clica "Salvar e regerar" → updateContract
// com regenerate=true re-resolve o contexto, re-renderiza markdown, persiste.

interface Props {
  contract: Contract
  meta:     ContractTypeMeta
}

const STATUS_OPTIONS: { value: ContractStatus; label: string; color: string }[] = [
  { value: 'draft',     label: 'Rascunho',  color: 'bg-[#2a2a2a] text-[#a3a3a3]' },
  { value: 'generated', label: 'Gerado',    color: 'bg-[#D4A853]/10 text-[#E8C47A]' },
  { value: 'reviewed',  label: 'Revisado',  color: 'bg-emerald-500/10 text-emerald-400' },
  { value: 'signed',    label: 'Assinado',  color: 'bg-sky-500/10 text-sky-400' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-500/10 text-red-400' },
]

const ORIGIN_LABELS: Record<string, string> = {
  budget:     'Orçamento',
  freelance:  'Freelance',
  order:      'Pedido',
  recurring:  'Recorrente',
  standalone: 'Avulso',
}

// Agrupamento visual dos placeholders para o formulário central
const FIELD_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Contratante (Cliente)',
    keys: [
      'contratante_nome', 'contratante_cpf', 'contratante_cnpj',
      'contratante_documento', 'contratante_endereco',
      'contratante_email', 'contratante_telefone',
    ],
  },
  {
    title: 'Contratada (Sua empresa)',
    keys: [
      'contratada_razao_social', 'contratada_cnpj', 'contratada_cpf',
      'contratada_endereco', 'contratada_email', 'contratada_telefone',
      'contratada_responsavel',
    ],
  },
  {
    title: 'Projeto',
    keys: [
      'titulo_projeto', 'descricao_projeto', 'escopo_entregaveis',
      'data_evento', 'data_inicio', 'data_fim', 'local_evento',
      'horas_cobertura', 'duracao_filme_final',
      'qtd_fotos', 'qtd_trocas_roupa',
      'prazo_entrega', 'cronograma_etapas', 'duracao_contrato',
      'frequencia', 'dia_pagamento',
    ],
  },
  {
    title: 'Financeiro',
    keys: [
      'valor_total', 'valor_mensal', 'valor_por_extenso',
      'moeda', 'condicao_pagamento', 'prazo_pagamento',
    ],
  },
  {
    title: 'Cláusulas variáveis',
    keys: [
      'direitos_uso', 'exclusividade', 'confidencialidade',
      'reajuste', 'dias_aviso_previo', 'dias_aviso_previo_rescisao',
      'pct_multa_cancelamento',
    ],
  },
  {
    title: 'Jurídicas',
    keys: ['cidade_foro', 'data_assinatura'],
  },
]

const FIELD_LABELS: Record<string, string> = {
  contratante_nome:      'Nome / Razão social',
  contratante_cpf:       'CPF',
  contratante_cnpj:      'CNPJ',
  contratante_documento: 'Documento (CPF/CNPJ)',
  contratante_endereco:  'Endereço',
  contratante_email:     'E-mail',
  contratante_telefone:  'Telefone',
  contratada_razao_social: 'Razão social',
  contratada_cnpj:         'CNPJ',
  contratada_cpf:          'CPF (MEI/autônomo)',
  contratada_endereco:     'Endereço',
  contratada_email:        'E-mail comercial',
  contratada_telefone:     'Telefone comercial',
  contratada_responsavel:  'Responsável pela assinatura',
  titulo_projeto:        'Título do projeto',
  descricao_projeto:     'Descrição',
  escopo_entregaveis:    'Escopo / entregáveis',
  data_evento:           'Data do evento',
  data_inicio:           'Início',
  data_fim:              'Fim',
  local_evento:          'Local',
  horas_cobertura:       'Horas de cobertura',
  duracao_filme_final:   'Duração do filme final (minutos)',
  qtd_fotos:             'Quantidade de fotos entregues',
  qtd_trocas_roupa:      'Trocas de roupa',
  prazo_entrega:         'Prazo de entrega (dias)',
  cronograma_etapas:     'Cronograma de etapas',
  duracao_contrato:      'Duração do contrato',
  frequencia:            'Frequência',
  dia_pagamento:         'Dia do pagamento',
  valor_total:           'Valor total (R$)',
  valor_mensal:          'Valor mensal (R$)',
  valor_por_extenso:     'Valor por extenso',
  moeda:                 'Moeda',
  condicao_pagamento:    'Condição de pagamento',
  prazo_pagamento:       'Prazo de pagamento',
  direitos_uso:          'Direitos de uso',
  exclusividade:         'Exclusividade',
  confidencialidade:     'Confidencialidade',
  reajuste:              'Reajuste',
  dias_aviso_previo:     'Dias de aviso prévio',
  dias_aviso_previo_rescisao: 'Aviso prévio p/ rescisão (dias)',
  pct_multa_cancelamento: 'Multa de cancelamento (%)',
  cidade_foro:           'Cidade do foro',
  data_assinatura:       'Data de assinatura',
}

export default function ContractBuilder({ contract: initial, meta }: Props) {
  const router = useRouter()
  const [contract, setContract] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  const [title, setTitle] = useState(contract.title)
  const [notes, setNotes] = useState(contract.notes_internal ?? '')

  // Overrides — mescla dos existentes em metadata + edições locais.
  const initialOverrides = contract.metadata?.overrides || {}
  const initialValues = contract.metadata?.values || {}
  const [overrides, setOverrides] = useState<Record<string, string>>(initialOverrides)

  const missing = contract.metadata?.missing || []
  const missingSet = useMemo(() => new Set(missing), [missing])

  const mergedValues = useMemo(
    () => ({ ...initialValues, ...overrides }),
    [initialValues, overrides]
  )

  const placeholderSet = useMemo(() => new Set(meta.placeholders), [meta.placeholders])

  // Somente campos relevantes para o tipo escolhido
  const visibleGroups = useMemo(() => {
    return FIELD_GROUPS.map(g => ({
      title: g.title,
      keys: g.keys.filter(k => placeholderSet.has(k)),
    })).filter(g => g.keys.length > 0)
  }, [placeholderSet])

  function setField(key: string, value: string) {
    setOverrides(prev => ({ ...prev, [key]: value }))
  }

  function handleSaveAndRegenerate() {
    startTransition(async () => {
      const res = await updateContract(contract.id, {
        title,
        notes_internal: notes,
        overrides,
        regenerate: true,
      })
      if (res.success) {
        setContract(res.data)
        setOverrides(res.data.metadata?.overrides || {})
        toast.success('Contrato atualizado e regerado.')
      } else {
        toast.error(res.message || 'Erro ao salvar.')
      }
    })
  }

  function handleChangeStatus(next: ContractStatus) {
    startTransition(async () => {
      const res = await updateContract(contract.id, { status: next })
      if (res.success) {
        setContract(res.data)
        toast.success(`Status alterado para ${next}.`)
      } else {
        toast.error(res.message || 'Erro ao mudar status.')
      }
    })
  }

  function handleDelete() {
    setConfirmDelete(false)
    startTransition(async () => {
      const res = await deleteContract(contract.id)
      if (res.success) {
        toast.success('Contrato excluído.')
        router.push('/contracts')
      } else {
        toast.error(res.message || 'Erro ao excluir.')
      }
    })
  }

  function handleCopy() {
    if (!contract.rendered_content) return
    navigator.clipboard.writeText(contract.rendered_content)
    toast.success('Contrato copiado para a área de transferência.')
  }

  function handleDownloadPdf() {
    if (!contract.rendered_content) {
      toast.error('Salve e regere o contrato antes de baixar.')
      return
    }
    window.location.assign(`/api/contracts/${contract.id}/pdf`)
  }

  function handleDownloadDocx() {
    if (!contract.rendered_content) {
      toast.error('Salve e regere o contrato antes de baixar.')
      return
    }
    window.location.assign(`/api/contracts/${contract.id}/docx`)
  }

  const statusBadge = STATUS_OPTIONS.find(s => s.value === contract.status)

  return (
    <div className="min-h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1c1c1c]">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Link
                href="/contracts"
                className="text-xs text-[#525252] hover:text-white transition-colors"
              >
                ← Contratos
              </Link>
              <span className="text-xs text-[#3a3a3a]">/</span>
              <span className="text-xs text-[#737373]">{meta.title}</span>
              {contract.origin_kind && contract.origin_kind !== 'standalone' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] uppercase tracking-wider">
                  {ORIGIN_LABELS[contract.origin_kind] || contract.origin_kind}
                </span>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-transparent text-white text-lg md:text-xl font-bold outline-none focus:ring-0 border-none p-0"
              placeholder="Título do contrato"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusBadge && (
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            )}
            <button
              onClick={handleSaveAndRegenerate}
              disabled={isPending}
              className="text-sm font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Salvando…' : 'Salvar e regerar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Disclaimer âmbar (IA) ──────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 md:px-8 pt-4">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-200/90 leading-relaxed">
          <strong className="text-amber-300">Aviso:</strong> modelo gerado
          automaticamente com base nos dados do sistema. Revise cuidadosamente
          todas as cláusulas e valide com um advogado antes de assinar. Não
          substitui aconselhamento jurídico.
        </div>
      </div>

      {/* ── Layout 2 colunas ───────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* ── Coluna ESQUERDA — Formulário ─────────────────────────────── */}
        <div className="space-y-6">
          {/* Status e ações */}
          <section className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">
              Status
            </h3>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleChangeStatus(opt.value)}
                  disabled={isPending || contract.status === opt.value}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    contract.status === opt.value
                      ? `${opt.color} ring-1 ring-white/10`
                      : 'bg-[#1a1a1a] text-[#737373] hover:text-white border border-[#2a2a2a]'
                  } disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* Campos agrupados */}
          {visibleGroups.map(group => (
            <section
              key={group.title}
              className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4"
            >
              <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">
                {group.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.keys.map(key => {
                  const value = mergedValues[key] ?? ''
                  const isMissing = missingSet.has(key) && !value
                  const isRequired = meta.required.includes(key)
                  return (
                    <div key={key} className={group.keys.length === 1 ? 'md:col-span-2' : ''}>
                      <label className="flex items-center gap-2 text-[11px] text-[#a3a3a3] mb-1">
                        {FIELD_LABELS[key] || key}
                        {isRequired && <span className="text-amber-400">*</span>}
                        {isMissing && (
                          <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 rounded">
                            pendente
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={value}
                        onChange={e => setField(key, e.target.value)}
                        placeholder={FIELD_LABELS[key] || key}
                        className={`w-full bg-[#0a0a0a] border rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#525252] outline-none focus:border-[#D4A853]/60 transition-colors ${
                          isMissing ? 'border-amber-500/30' : 'border-[#2a2a2a]'
                        }`}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {/* Notas internas */}
          <section className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">
              Observações internas
            </h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas que não aparecem no contrato final…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#525252] outline-none focus:border-[#D4A853]/60 resize-none"
            />
          </section>

          {/* Ações finais */}
          <section className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2">
              Ações
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                disabled={!contract.rendered_content || isPending}
                className="text-xs font-semibold text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Copiar texto
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={!contract.rendered_content || isPending}
                className="text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] border border-[#D4A853] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Baixar PDF
              </button>
              <button
                onClick={handleDownloadDocx}
                disabled={!contract.rendered_content || isPending}
                className="text-xs font-semibold text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Baixar Word (.docx)
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={isPending}
                className="text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ml-auto"
              >
                Excluir contrato
              </button>
            </div>
          </section>
        </div>

        {/* ── Coluna DIREITA — Prévia ─────────────────────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider">
              Prévia do contrato
            </h3>
            <button
              onClick={() => setShowPreview(p => !p)}
              className="text-xs text-[#737373] hover:text-white transition-colors lg:hidden"
            >
              {showPreview ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {showPreview && (
            <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-xl p-5 max-h-[80vh] overflow-y-auto">
              {contract.rendered_content ? (
                <pre className="whitespace-pre-wrap text-sm text-[#d4d4d4] leading-relaxed font-sans">
                  {contract.rendered_content}
                </pre>
              ) : (
                <p className="text-sm text-[#525252] italic">
                  Ainda não há contrato gerado. Preencha os campos e clique em
                  "Salvar e regerar".
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de confirmação de delete ─────────────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">Excluir contrato?</h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              Essa ação oculta o contrato da lista. Ele pode ser recuperado
              manualmente no banco.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
