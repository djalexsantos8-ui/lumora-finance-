import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { substituteLetterVars, type LetterVars } from '@/lib/budgets/letter-vars'

/**
 * EPIC-16 — Template PDF cliente do orçamento V2.
 *
 * Princípio fundamental: NUNCA expõe `unit_cost` nem markup detalhado.
 * Items individuais mostram o valor final cobrado. Margem + impostos +
 * provisões aparecem agregados como "Encargos do projeto" — eufemismo
 * profissional que respeita o trabalho do filmmaker.
 *
 * Sem fontes customizadas (usa Helvetica default — mais previsível em
 * Vercel sem upload de TTF). Paleta Lumora: #0a0a0a + #D4A853.
 */

interface ClienteOption {
  id:   string
  name: string
}

interface BudgetForPdf {
  number:              string
  name:                string
  status:              string
  start_date:          string | null
  end_date:            string | null
  location:            string | null
  margin_percent:      number
  tax_percent:         number
  discount_amount:     number
  payment_terms:       string | null
  validity_days:       number | null
  delivery_days:       number | null
  revisions_included:  number | null
  notes_client:        string | null
  letter_text_md:      string | null
  subtotal:            number
  margin_amount:       number
  tax_amount:          number
  total:               number
  created_at:          string
}

interface ItemForPdf {
  description:         string
  description_visible: string | null
  category:            string | null
  unit:                string | null
  days:                number
  people:              number
  quantity:            number
  unit_price:          number
  total:               number
  is_encargo:          boolean
}

export interface BudgetClientePdfProps {
  workspaceName:  string
  budget:         BudgetForPdf
  items:          ItemForPdf[]
  client:         ClienteOption | null
}

const styles = StyleSheet.create({
  page:        { backgroundColor: '#ffffff', padding: 40, fontSize: 10, color: '#0a0a0a' },
  header:      { borderBottomWidth: 2, borderBottomColor: '#D4A853', paddingBottom: 12, marginBottom: 18 },
  brand:       { fontSize: 14, fontWeight: 700, color: '#0a0a0a', letterSpacing: 1 },
  brandAccent: { color: '#D4A853' },
  title:       { fontSize: 16, fontWeight: 700, marginTop: 8, color: '#0a0a0a' },
  subtitle:    { fontSize: 10, color: '#525252', marginTop: 4 },

  metaRow:     { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginBottom: 18 },
  metaCell:    { width: '50%', marginBottom: 6 },
  metaLabel:   { fontSize: 8, color: '#737373', textTransform: 'uppercase', letterSpacing: 1 },
  metaValue:   { fontSize: 11, color: '#0a0a0a', marginTop: 2 },

  sectionTitle: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#525252', marginBottom: 8, letterSpacing: 1 },

  table:       { borderTopWidth: 1, borderTopColor: '#e5e5e5', marginBottom: 12 },
  rowHeader:   { flexDirection: 'row', backgroundColor: '#f5f5f5', paddingVertical: 6, paddingHorizontal: 4 },
  row:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 8, paddingHorizontal: 4 },
  cellDesc:    { flex: 4, paddingRight: 6 },
  cellQty:     { flex: 1, textAlign: 'center' },
  cellUnit:    { flex: 2, textAlign: 'right' },
  cellTotal:   { flex: 2, textAlign: 'right', fontWeight: 700 },
  cellTH:      { fontSize: 9, color: '#525252', textTransform: 'uppercase', letterSpacing: 0.5 },

  encargosBox:    { backgroundColor: '#fafafa', padding: 12, marginTop: 12, borderLeftWidth: 3, borderLeftColor: '#D4A853' },
  encargosTitle:  { fontSize: 11, fontWeight: 700, color: '#0a0a0a' },
  encargosValue:  { fontSize: 11, fontWeight: 700, color: '#0a0a0a' },
  encargosDesc:   { fontSize: 9, color: '#525252', marginTop: 4, lineHeight: 1.4 },
  rowSpaceBetween:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  totalBox:    { marginTop: 18, padding: 16, backgroundColor: '#0a0a0a', borderRadius: 4 },
  totalLabel:  { fontSize: 10, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1 },
  totalValue:  { fontSize: 22, fontWeight: 700, color: '#D4A853', marginTop: 4 },

  conditions:  { marginTop: 18 },
  condItem:    { fontSize: 10, color: '#0a0a0a', lineHeight: 1.5, marginBottom: 2 },

  notes:       { marginTop: 18, padding: 10, backgroundColor: '#fafafa', borderRadius: 4 },
  notesText:   { fontSize: 9, color: '#525252', lineHeight: 1.5 },

  letter:        { marginBottom: 18 },
  letterH:       { fontSize: 12, fontWeight: 700, color: '#0a0a0a', marginTop: 8, marginBottom: 4 },
  letterPara:    { fontSize: 10, color: '#0a0a0a', lineHeight: 1.5, marginBottom: 6 },

  footer:      {
    position: 'absolute', bottom: 24, left: 40, right: 40,
    fontSize: 8, color: '#a3a3a3', textAlign: 'center',
    borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 6,
  },
})

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return iso }
}

export function BudgetClientePdf({
  workspaceName,
  budget,
  items,
  client,
}: BudgetClientePdfProps): ReactElement {
  const visibleItems = items.filter((i) => !i.is_encargo)
  const encargoItems = items.filter((i) => i.is_encargo)

  // Itens marcados explicitamente como encargo + margem + impostos − desconto
  const encargosFromItems = encargoItems.reduce((s, i) => s + Number(i.total ?? 0), 0)
  const encargosTotal =
    encargosFromItems +
    Number(budget.margin_amount ?? 0) +
    Number(budget.tax_amount ?? 0) -
    Number(budget.discount_amount ?? 0)

  return (
    <Document
      title={`Orçamento ${budget.number} — ${budget.name}`}
      author={workspaceName}
      creator="Lumora Solutions"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>
            LUMORA <Text style={styles.brandAccent}>FINANCE</Text>
          </Text>
          <Text style={styles.title}>Orçamento — {budget.name || 'Sem nome'}</Text>
          <Text style={styles.subtitle}>
            {workspaceName}
            {client?.name ? ` · Cliente: ${client.name}` : ''}
            {' · '}
            {fmtDate(budget.created_at)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Número</Text>
            <Text style={styles.metaValue}>{budget.number}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{statusLabel(budget.status)}</Text>
          </View>
          {budget.start_date ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Início</Text>
              <Text style={styles.metaValue}>{fmtDate(budget.start_date)}</Text>
            </View>
          ) : null}
          {budget.end_date ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Fim</Text>
              <Text style={styles.metaValue}>{fmtDate(budget.end_date)}</Text>
            </View>
          ) : null}
          {budget.location ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Local</Text>
              <Text style={styles.metaValue}>{budget.location}</Text>
            </View>
          ) : null}
        </View>

        {budget.letter_text_md?.trim() ? (
          <View style={styles.letter}>
            {renderLetterMarkdown(budget.letter_text_md, {
              cliente_nome:    client?.name ?? null,
              projeto_nome:    budget.name ?? null,
              numero:          budget.number ?? null,
              produtora_nome:  workspaceName,
              validade:        budget.validity_days
                ? `${budget.validity_days} dias após emissão`
                : null,
              prazo_entrega:   budget.delivery_days
                ? `${budget.delivery_days} dias após aprovação`
                : null,
            })}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Itens do projeto</Text>
        <View style={styles.table}>
          <View style={styles.rowHeader}>
            <Text style={[styles.cellDesc, styles.cellTH]}>Descrição</Text>
            <Text style={[styles.cellQty, styles.cellTH]}>Qtd</Text>
            <Text style={[styles.cellUnit, styles.cellTH]}>Valor unit.</Text>
            <Text style={[styles.cellTotal, styles.cellTH]}>Total</Text>
          </View>

          {visibleItems.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.cellDesc}>Sem itens listados.</Text>
            </View>
          ) : (
            visibleItems.map((item, idx) => {
              const desc = item.description_visible?.trim() || item.description
              const qty  = Number(item.quantity ?? 1) * Number(item.days ?? 1) * Number(item.people ?? 1)
              return (
                <View style={styles.row} key={idx} wrap={false}>
                  <Text style={styles.cellDesc}>{desc}</Text>
                  <Text style={styles.cellQty}>{Number.isInteger(qty) ? qty : qty.toFixed(1)}</Text>
                  <Text style={styles.cellUnit}>{fmtBRL(Number(item.unit_price ?? 0))}</Text>
                  <Text style={styles.cellTotal}>{fmtBRL(Number(item.total ?? 0))}</Text>
                </View>
              )
            })
          )}
        </View>

        {encargosTotal > 0 ? (
          <View style={styles.encargosBox}>
            <View style={styles.rowSpaceBetween}>
              <Text style={styles.encargosTitle}>Encargos do projeto</Text>
              <Text style={styles.encargosValue}>{fmtBRL(encargosTotal)}</Text>
            </View>
            <Text style={styles.encargosDesc}>
              Inclui custos operacionais, impostos sobre o serviço, provisão de retrabalho
              e gestão da produção. Calculado conforme prática de mercado.
            </Text>
          </View>
        ) : null}

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total geral do projeto</Text>
          <Text style={styles.totalValue}>{fmtBRL(Number(budget.total ?? 0))}</Text>
        </View>

        <View style={styles.conditions}>
          <Text style={styles.sectionTitle}>Condições</Text>
          {budget.payment_terms ? (
            <Text style={styles.condItem}>• Pagamento: {budget.payment_terms}</Text>
          ) : null}
          {budget.validity_days ? (
            <Text style={styles.condItem}>• Validade do orçamento: {budget.validity_days} dias</Text>
          ) : null}
          {budget.delivery_days ? (
            <Text style={styles.condItem}>• Prazo de entrega: {budget.delivery_days} dias após aprovação</Text>
          ) : null}
          {budget.revisions_included ? (
            <Text style={styles.condItem}>• Revisões inclusas: {budget.revisions_included}</Text>
          ) : null}
          <Text style={styles.condItem}>
            • Quaisquer alterações de escopo serão objeto de aditivo formal.
          </Text>
        </View>

        {budget.notes_client?.trim() ? (
          <View style={styles.notes}>
            <Text style={styles.notesText}>{budget.notes_client}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {workspaceName} · Orçamento gerado por Lumora Finance · {fmtDate(new Date().toISOString())}
        </Text>
      </Page>
    </Document>
  )
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft:     'Rascunho',
    sent:      'Enviado',
    approved:  'Aprovado',
    rejected:  'Recusado',
    converted: 'Convertido em job',
    expired:   'Vencido',
    archived:  'Arquivado',
  }
  return map[s] ?? s
}

/**
 * Render Markdown simples → react-pdf primitives.
 *
 * Suportado: ## títulos (h2/h3 viram letterH), parágrafos, linhas em branco.
 * Inline: **bold** e *italic* — não suportados na primeira iteração (texto literal).
 * Iteração futura pode adicionar inline parsing ou migrar pra Tiptap → ProseMirror.
 */
function renderLetterMarkdown(md: string, vars: LetterVars): ReactElement[] {
  const text = substituteLetterVars(md, vars).replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const out: ReactElement[] = []
  const buffer: string[] = []
  let key = 0

  const flushPara = () => {
    const para = buffer.join(' ').trim()
    buffer.length = 0
    if (para) {
      out.push(<Text key={`p-${key++}`} style={styles.letterPara}>{para}</Text>)
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('## ') || line.startsWith('### ')) {
      flushPara()
      const h = line.replace(/^#{2,3}\s+/, '')
      out.push(<Text key={`h-${key++}`} style={styles.letterH}>{h}</Text>)
    } else if (line === '') {
      flushPara()
    } else {
      buffer.push(line)
    }
  }
  flushPara()
  return out
}
