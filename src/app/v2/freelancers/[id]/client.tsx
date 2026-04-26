'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fmtBRL } from '@/lib/v2/budget-calc'
import {
  DISPONIBILIDADES, FUNCOES_PRINCIPAIS, RESTRICOES_ALIMENTARES, UFS,
  funcaoLabel,
} from '@/lib/v2/freelancer-constants'
import { deleteFreelancer, updateFreelancer } from '../actions'

/**
 * EPIC-21 — Editor de freelancer V2.
 *
 * Auto-save com debounce 700ms em qualquer mudança. Botão Excluir
 * pede confirm e redireciona pra lista.
 */

interface FreelancerRow {
  id:                  string
  workspace_id:        string
  nome_completo:       string
  nome_artistico:      string | null
  display_name:        string
  cpf:                 string | null
  email:               string | null
  telefone:            string | null
  whatsapp:            string | null
  instagram:           string | null
  vimeo_url:           string | null
  portfolio_url:       string | null
  funcao_principal:    string
  skills:              string[]
  experiencia_anos:    number | null
  tarifa_diaria:       number | null
  tarifa_hora:         number | null
  cidade:              string | null
  uf:                  string | null
  disponibilidade:     string | null
  restricao_alimentar: string | null
  restricao_alimentar_detalhe: string | null
  tem_carro:           boolean
  tem_cnh:             boolean
  equipamento_proprio: string | null
  equipamento_disponivel_para_emprestimo: boolean
  pix_chave:           string | null
  banco_nome:          string | null
  banco_agencia:       string | null
  banco_conta:         string | null
  banco_tipo:          string | null
  notes:               string | null
  rating:              number | null
  tags:                string[]
}

const numOrNull = (v: string): number | null => {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function FreelancerEditorClient({ freelancer }: { freelancer: FreelancerRow }) {
  const router = useRouter()
  const [f, setF] = useState<FreelancerRow>(freelancer)
  const [skillsRaw, setSkillsRaw] = useState((freelancer.skills ?? []).join(', '))
  const [tagsRaw, setTagsRaw]     = useState((freelancer.tags ?? []).join(', '))
  const [pending, startTx] = useTransition()
  const [flash, setFlash] = useState<string | null>(null)

  const fn = funcaoLabel(f.funcao_principal)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function scheduleSave(patch: Partial<FreelancerRow> & { skills?: string[]; tags?: string[] }) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      startTx(async () => {
        const r = await updateFreelancer(f.id, patch)
        if (r.ok) {
          setFlash('✓ Salvo')
          setTimeout(() => setFlash(null), 1500)
        } else {
          setFlash(`Erro: ${r.error}`)
        }
      })
    }, 700)
  }

  function update(patch: Partial<FreelancerRow>) {
    setF((prev) => ({ ...prev, ...patch }))
    scheduleSave(patch)
  }

  function updateSkills(raw: string) {
    setSkillsRaw(raw)
    const arr = raw.split(',').map((s) => s.trim()).filter(Boolean)
    setF((prev) => ({ ...prev, skills: arr }))
    scheduleSave({ skills: arr })
  }

  function updateTags(raw: string) {
    setTagsRaw(raw)
    const arr = raw.split(',').map((s) => s.trim()).filter(Boolean)
    setF((prev) => ({ ...prev, tags: arr }))
    scheduleSave({ tags: arr })
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function handleDelete() {
    if (!confirm(`Excluir "${f.display_name}" permanentemente?`)) return
    startTx(async () => {
      const r = await deleteFreelancer(f.id)
      if (r.ok) router.push('/v2/freelancers')
      else alert(`Erro: ${r.error}`)
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-2xl font-bold text-white">
            <span>{fn.icon}</span>
            <span>{f.display_name}</span>
          </div>
          <div className="mt-1 text-sm text-[#a3a3a3]">{fn.label}</div>
          {f.nome_artistico && f.nome_artistico !== f.display_name ? (
            <div className="text-xs text-[#737373]">Nome artístico: {f.nome_artistico}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {flash ? <span className="text-emerald-400">{flash}</span> : null}
          {pending && !flash ? <span className="text-[#737373]">Salvando…</span> : null}
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            Excluir
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* IDENTIDADE */}
        <Section title="Identidade">
          <Grid>
            <Input label="Nome completo" value={f.nome_completo} onChange={(v) => update({ nome_completo: v })} />
            <Input label="Nome artístico" value={f.nome_artistico ?? ''} onChange={(v) => update({ nome_artistico: v || null })} />
            <Input label="Display name" value={f.display_name} onChange={(v) => update({ display_name: v })} />
            <Input label="CPF" value={f.cpf ?? ''} onChange={(v) => update({ cpf: v || null })} />
          </Grid>
        </Section>

        {/* FUNÇÃO */}
        <Section title="Função e habilidades">
          <Grid>
            <Select
              label="Função principal"
              value={f.funcao_principal}
              onChange={(v) => update({ funcao_principal: v })}
              options={FUNCOES_PRINCIPAIS.map((o) => ({ value: o.value, label: `${o.icon} ${o.label}` }))}
            />
            <Input
              label="Anos de experiência"
              type="number"
              value={String(f.experiencia_anos ?? '')}
              onChange={(v) => update({ experiencia_anos: v ? Number(v) : null })}
            />
          </Grid>
          <Input
            label="Skills (separe por vírgula)"
            value={skillsRaw}
            onChange={updateSkills}
            placeholder="câmera_RED, drone, gimbal_DJI, underwater"
          />
        </Section>

        {/* CONTATO */}
        <Section title="Contato e redes">
          <Grid>
            <Input label="Email"     type="email" value={f.email ?? ''}     onChange={(v) => update({ email: v || null })} />
            <Input label="Telefone"  value={f.telefone ?? ''}  onChange={(v) => update({ telefone: v || null })} />
            <Input label="WhatsApp"  value={f.whatsapp ?? ''}  onChange={(v) => update({ whatsapp: v || null })} />
            <Input label="Instagram" value={f.instagram ?? ''} onChange={(v) => update({ instagram: v.replace(/^@/, '') || null })} placeholder="@user" />
            <Input label="Vimeo"     type="url" value={f.vimeo_url ?? ''}     onChange={(v) => update({ vimeo_url: v || null })} />
            <Input label="Portfolio" type="url" value={f.portfolio_url ?? ''} onChange={(v) => update({ portfolio_url: v || null })} />
          </Grid>
        </Section>

        {/* TARIFA */}
        <Section title="Tarifa">
          <Grid>
            <Input
              label="Tarifa diária (R$)"
              value={f.tarifa_diaria != null ? String(f.tarifa_diaria) : ''}
              onChange={(v) => update({ tarifa_diaria: numOrNull(v) })}
              placeholder="1200"
            />
            <Input
              label="Tarifa por hora (R$)"
              value={f.tarifa_hora != null ? String(f.tarifa_hora) : ''}
              onChange={(v) => update({ tarifa_hora: numOrNull(v) })}
              placeholder="200"
            />
          </Grid>
          {f.tarifa_diaria ? (
            <p className="text-[10px] text-[#737373]">
              Diária: <span className="font-mono text-[#D4A853]">{fmtBRL(Number(f.tarifa_diaria))}</span>
            </p>
          ) : null}
        </Section>

        {/* LOGÍSTICA */}
        <Section title="Logística">
          <Grid cols={3}>
            <Input  label="Cidade" value={f.cidade ?? ''} onChange={(v) => update({ cidade: v || null })} />
            <Select label="UF" value={f.uf ?? ''} onChange={(v) => update({ uf: v || null })}
              options={[{ value: '', label: '—' }, ...UFS.map((u) => ({ value: u, label: u }))]} />
            <Select label="Disponibilidade" value={f.disponibilidade ?? ''} onChange={(v) => update({ disponibilidade: v || null })}
              options={[{ value: '', label: '—' }, ...DISPONIBILIDADES.map((d) => ({ value: d.value, label: d.label }))]} />
          </Grid>
          <Grid>
            <Select label="Restrição alimentar" value={f.restricao_alimentar ?? ''} onChange={(v) => update({ restricao_alimentar: v || null })}
              options={[{ value: '', label: '—' }, ...RESTRICOES_ALIMENTARES.map((r) => ({ value: r.value, label: r.label }))]} />
            <Input label="Detalhe (se 'outro')" value={f.restricao_alimentar_detalhe ?? ''} onChange={(v) => update({ restricao_alimentar_detalhe: v || null })} />
          </Grid>
          <div className="flex flex-wrap gap-4 text-sm">
            <Checkbox label="Tem carro"     checked={f.tem_carro} onChange={(v) => update({ tem_carro: v })} />
            <Checkbox label="Tem CNH"       checked={f.tem_cnh}   onChange={(v) => update({ tem_cnh: v })} />
          </div>
        </Section>

        {/* EQUIPAMENTO */}
        <Section title="Equipamento">
          <TextArea
            label="Equipamento próprio"
            value={f.equipamento_proprio ?? ''}
            onChange={(v) => update({ equipamento_proprio: v || null })}
            placeholder="Sony FX6, gimbal Ronin RS3, tripé Manfrotto"
          />
          <Checkbox
            label="Disponibiliza pra empréstimo"
            checked={f.equipamento_disponivel_para_emprestimo}
            onChange={(v) => update({ equipamento_disponivel_para_emprestimo: v })}
          />
        </Section>

        {/* PAGAMENTO */}
        <Section title="Pagamento">
          <Grid>
            <Input label="Chave PIX" value={f.pix_chave ?? ''} onChange={(v) => update({ pix_chave: v || null })} />
            <Input label="Banco" value={f.banco_nome ?? ''} onChange={(v) => update({ banco_nome: v || null })} />
            <Input label="Agência" value={f.banco_agencia ?? ''} onChange={(v) => update({ banco_agencia: v || null })} />
            <Input label="Conta" value={f.banco_conta ?? ''} onChange={(v) => update({ banco_conta: v || null })} />
            <Select label="Tipo de conta" value={f.banco_tipo ?? ''} onChange={(v) => update({ banco_tipo: v || null })}
              options={[
                { value: '', label: '—' },
                { value: 'corrente', label: 'Corrente' },
                { value: 'poupanca', label: 'Poupança' },
              ]} />
          </Grid>
        </Section>

        {/* NOTAS */}
        <Section title="Notas internas">
          <TextArea label="Anotações" value={f.notes ?? ''} onChange={(v) => update({ notes: v || null })} placeholder="Pontos fortes, observações, etc" />
          <Grid>
            <Select
              label="Sua avaliação"
              value={String(f.rating ?? '')}
              onChange={(v) => update({ rating: v ? Number(v) : null })}
              options={[
                { value: '', label: '—' },
                { value: '1', label: '★ ☆ ☆ ☆ ☆' },
                { value: '2', label: '★ ★ ☆ ☆ ☆' },
                { value: '3', label: '★ ★ ★ ☆ ☆' },
                { value: '4', label: '★ ★ ★ ★ ☆' },
                { value: '5', label: '★ ★ ★ ★ ★' },
              ]} />
            <Input label="Tags livres (vírgula)" value={tagsRaw} onChange={updateTags} placeholder="vip, parceiro, novo" />
          </Grid>
        </Section>
      </div>
    </div>
  )
}

// ── Form helpers (client) ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Grid({ cols = 2, children }: { cols?: 2 | 3; children: React.ReactNode }) {
  const cls = cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
  return <div className={`grid grid-cols-1 ${cls} gap-3`}>{children}</div>
}

function Input({
  label, value, onChange, type = 'text', placeholder,
}: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  type?:        string
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
      />
    </div>
  )
}

function TextArea({
  label, value, onChange, placeholder,
}: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">{label}</label>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
      />
    </div>
  )
}

function Select({
  label, value, onChange, options,
}: {
  label:    string
  value:    string
  onChange: (v: string) => void
  options:  { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:border-[#D4A853] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function Checkbox({
  label, checked, onChange,
}: {
  label:    string
  checked:  boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-[#a3a3a3]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[#2a2a2a] bg-[#111]"
      />
      <span>{label}</span>
    </label>
  )
}
