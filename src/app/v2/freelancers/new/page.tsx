import Link from 'next/link'
import { createFreelancer } from '../actions'
import {
  DISPONIBILIDADES, FUNCOES_PRINCIPAIS, RESTRICOES_ALIMENTARES, UFS,
} from '@/lib/v2/freelancer-constants'

export const dynamic = 'force-dynamic'

/**
 * Cadastro completo de freelancer — form linear (sem wizard).
 * Sections agrupadas em fieldsets pra clareza visual.
 */
export default function NewFreelancerPage() {
  async function action(formData: FormData) {
    'use server'

    const skills = String(formData.get('skills') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const tags = String(formData.get('tags') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const numOrNull = (k: string) => {
      const v = String(formData.get(k) ?? '').trim()
      if (!v) return null
      const n = Number(v.replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    const ratingRaw = String(formData.get('rating') ?? '').trim()
    const rating = ratingRaw ? Math.min(5, Math.max(1, Number(ratingRaw))) : null

    await createFreelancer({
      nome_completo:       String(formData.get('nome_completo') ?? '').trim() || 'Sem nome',
      nome_artistico:      String(formData.get('nome_artistico') ?? '').trim() || null,
      display_name:        String(formData.get('display_name') ?? '').trim() || null,
      cpf:                 String(formData.get('cpf') ?? '').trim() || null,
      email:               String(formData.get('email') ?? '').trim() || null,
      telefone:            String(formData.get('telefone') ?? '').trim() || null,
      whatsapp:            String(formData.get('whatsapp') ?? '').trim() || null,
      instagram:           String(formData.get('instagram') ?? '').trim() || null,
      vimeo_url:           String(formData.get('vimeo_url') ?? '').trim() || null,
      portfolio_url:       String(formData.get('portfolio_url') ?? '').trim() || null,
      funcao_principal:    String(formData.get('funcao_principal') ?? 'other'),
      skills,
      experiencia_anos:    numOrNull('experiencia_anos'),
      tarifa_diaria:       numOrNull('tarifa_diaria'),
      tarifa_hora:         numOrNull('tarifa_hora'),
      cidade:              String(formData.get('cidade') ?? '').trim() || null,
      uf:                  String(formData.get('uf') ?? '').trim() || null,
      disponibilidade:     String(formData.get('disponibilidade') ?? '').trim() || null,
      restricao_alimentar: String(formData.get('restricao_alimentar') ?? '').trim() || null,
      restricao_alimentar_detalhe: String(formData.get('restricao_alimentar_detalhe') ?? '').trim() || null,
      tem_carro:           formData.get('tem_carro') === 'on',
      tem_cnh:             formData.get('tem_cnh') === 'on',
      equipamento_proprio: String(formData.get('equipamento_proprio') ?? '').trim() || null,
      equipamento_disponivel_para_emprestimo: formData.get('equipamento_disponivel_para_emprestimo') === 'on',
      pix_chave:           String(formData.get('pix_chave') ?? '').trim() || null,
      banco_nome:          String(formData.get('banco_nome') ?? '').trim() || null,
      banco_agencia:       String(formData.get('banco_agencia') ?? '').trim() || null,
      banco_conta:         String(formData.get('banco_conta') ?? '').trim() || null,
      banco_tipo:          String(formData.get('banco_tipo') ?? '').trim() || null,
      notes:               String(formData.get('notes') ?? '').trim() || null,
      rating,
      tags,
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/v2/freelancers" className="mb-6 inline-flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white">
        ← Voltar
      </Link>

      <h1 className="mb-2 text-2xl font-bold text-white">Novo freelancer</h1>
      <p className="mb-8 text-sm text-[#737373]">
        Só os 3 primeiros campos são obrigatórios — o resto você pode preencher depois.
      </p>

      <form action={action} className="space-y-6">

        {/* IDENTIDADE */}
        <Section title="Identidade" required>
          <Grid cols={2}>
            <Field name="nome_completo" label="Nome completo *" required placeholder="Marina da Silva" />
            <Field name="nome_artistico" label="Nome artístico" placeholder="DJ Caverna" />
            <Field name="display_name" label="Como aparece nas listagens" placeholder="Marina (default: primeiro nome)" />
            <Field name="cpf" label="CPF" placeholder="000.000.000-00" />
          </Grid>
        </Section>

        {/* FUNÇÃO */}
        <Section title="Função e habilidades" required>
          <Grid cols={2}>
            <SelectField name="funcao_principal" label="Função principal *" required options={FUNCOES_PRINCIPAIS.map((f) => ({ value: f.value, label: `${f.icon} ${f.label}` }))} />
            <Field name="experiencia_anos" label="Anos de experiência" type="number" placeholder="5" />
          </Grid>
          <Field
            name="skills"
            label="Skills / equipamentos dominados"
            placeholder="câmera_RED, drone, gimbal_DJI, underwater"
            hint="Separe por vírgula. Use o que faria sentido pra você buscar depois."
          />
        </Section>

        {/* CONTATO */}
        <Section title="Contato e redes">
          <Grid cols={2}>
            <Field name="email" label="Email" type="email" />
            <Field name="telefone" label="Telefone" placeholder="(11) 99999-9999" />
            <Field name="whatsapp" label="WhatsApp" placeholder="(11) 99999-9999" />
            <Field name="instagram" label="Instagram" placeholder="@marinacam" />
            <Field name="vimeo_url" label="Vimeo" type="url" placeholder="https://vimeo.com/marinacam" />
            <Field name="portfolio_url" label="Portfolio / site" type="url" />
          </Grid>
        </Section>

        {/* TARIFA */}
        <Section title="Tarifa">
          <Grid cols={2}>
            <Field name="tarifa_diaria" label="Tarifa diária (R$)" placeholder="1200" />
            <Field name="tarifa_hora" label="Tarifa por hora (R$)" placeholder="200" />
          </Grid>
        </Section>

        {/* LOGÍSTICA */}
        <Section title="Logística">
          <Grid cols={3}>
            <Field name="cidade" label="Cidade" />
            <SelectField name="uf" label="UF" options={[{ value: '', label: '—' }, ...UFS.map((u) => ({ value: u, label: u }))]} />
            <SelectField name="disponibilidade" label="Disponibilidade" options={[{ value: '', label: '—' }, ...DISPONIBILIDADES.map((d) => ({ value: d.value, label: d.label }))]} />
          </Grid>
          <Grid cols={2}>
            <SelectField name="restricao_alimentar" label="Restrição alimentar" options={[{ value: '', label: '—' }, ...RESTRICOES_ALIMENTARES.map((r) => ({ value: r.value, label: r.label }))]} />
            <Field name="restricao_alimentar_detalhe" label="Detalhe (se 'outro')" />
          </Grid>
          <div className="flex flex-wrap gap-4 text-sm text-white">
            <Checkbox name="tem_carro" label="Tem carro" />
            <Checkbox name="tem_cnh" label="Tem CNH" />
          </div>
        </Section>

        {/* EQUIPAMENTO */}
        <Section title="Equipamento">
          <Field
            name="equipamento_proprio"
            label="Equipamento próprio"
            placeholder="Sony FX6, gimbal Ronin RS3, tripé Manfrotto"
            multiline
          />
          <Checkbox name="equipamento_disponivel_para_emprestimo" label="Disponibiliza pra empréstimo" />
        </Section>

        {/* PAGAMENTO */}
        <Section title="Pagamento">
          <Grid cols={2}>
            <Field name="pix_chave" label="Chave PIX" placeholder="email/CPF/aleatória" />
            <Field name="banco_nome" label="Banco" />
            <Field name="banco_agencia" label="Agência" />
            <Field name="banco_conta" label="Conta" />
            <SelectField name="banco_tipo" label="Tipo de conta" options={[
              { value: '', label: '—' },
              { value: 'corrente', label: 'Corrente' },
              { value: 'poupanca', label: 'Poupança' },
            ]} />
          </Grid>
          <p className="text-[10px] text-[#525252]">
            Esses dados ficam apenas na sua conta Lumora — usados pra você gerar pagamentos. Nunca compartilhamos.
          </p>
        </Section>

        {/* NOTAS */}
        <Section title="Notas internas">
          <Field name="notes" label="Anotações" placeholder="Pontos fortes, observações, etc" multiline />
          <Grid cols={2}>
            <SelectField name="rating" label="Sua avaliação" options={[
              { value: '', label: '—' },
              { value: '1', label: '★ ☆ ☆ ☆ ☆' },
              { value: '2', label: '★ ★ ☆ ☆ ☆' },
              { value: '3', label: '★ ★ ★ ☆ ☆' },
              { value: '4', label: '★ ★ ★ ★ ☆' },
              { value: '5', label: '★ ★ ★ ★ ★' },
            ]} />
            <Field name="tags" label="Tags livres (vírgula)" placeholder="vip, parceiro, novo" />
          </Grid>
        </Section>

        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-md bg-[#D4A853] px-6 py-3 text-sm font-semibold text-black hover:bg-[#e0b95f]">
            Salvar freelancer
          </button>
          <Link href="/v2/freelancers" className="text-sm text-[#737373] hover:text-white">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}

// ── Form helpers ────────────────────────────────────────────────────────────

function Section({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-5">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">
        {title}{required ? <span className="ml-1 text-red-400">*</span> : ''}
      </legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  )
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  const cls = cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
  return <div className={`grid grid-cols-1 ${cls} gap-3`}>{children}</div>
}

function Field({
  name, label, placeholder, type = 'text', required, multiline, hint,
}: {
  name:         string
  label:        string
  placeholder?: string
  type?:        string
  required?:    boolean
  multiline?:   boolean
  hint?:        string
}) {
  const cls = "w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">{label}</label>
      {multiline ? (
        <textarea name={name} placeholder={placeholder} rows={3} className={cls} />
      ) : (
        <input type={type} name={name} placeholder={placeholder} required={required} className={cls} />
      )}
      {hint ? <p className="mt-1 text-[10px] text-[#525252]">{hint}</p> : null}
    </div>
  )
}

function SelectField({
  name, label, options, required,
}: {
  name:    string
  label:   string
  options: { value: string; label: string }[]
  required?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">{label}</label>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:border-[#D4A853] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function Checkbox({ name, label }: { name: string; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-[#a3a3a3]">
      <input type="checkbox" name={name} className="h-4 w-4 rounded border-[#2a2a2a] bg-[#111]" />
      <span>{label}</span>
    </label>
  )
}
