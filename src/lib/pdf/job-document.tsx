import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Job, JobRevenueItem, JobCostItem } from '@/types/job'
import { calcJobFinancials } from '@/types/job'
import { formatDate } from '@/lib/utils/format'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(value: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function todayFormatted(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${
    String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Desmonta o prefixo de categoria de serviço codificado na descrição.
// Ex: "Filmagem • Captação casamento" → { category: "Filmagem", text: "Captação casamento" }
const SERVICE_PREFIXES = [
  'Filmagem', 'Fotografia', 'Edição', 'Drone', 'Direção', 'Motion', 'Produção',
]

function parseDesc(description: string): { category: string | null; text: string } {
  for (const p of SERVICE_PREFIXES) {
    if (description.startsWith(`${p} \u2022 `)) {
      return { category: p, text: description.slice(`${p} \u2022 `.length) }
    }
  }
  return { category: null, text: description }
}

// ─── Tokens de design (alinhados ao budget-document) ─────────────────────────

const GOLD  = '#C49A2C'
const DARK  = '#1a1a1a'
const GRAY  = '#6b6b6b'
const LGRAY = '#f5f5f5'
const LINE  = '#e8e8e8'
const WHITE = '#ffffff'
const GREEN = '#2e7d32'

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    paddingTop:    52,
    paddingBottom: 60,
    paddingLeft:   60,
    paddingRight:  60,
    fontFamily:    'Helvetica',
    fontSize:      9,
    color:         DARK,
  },

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   24,
  },
  headerLabel: {
    fontSize:      8,
    color:         GOLD,
    fontFamily:    'Helvetica-Bold',
    letterSpacing: 2,
    marginBottom:  10,
  },
  jobTitle: {
    fontSize:    22,
    fontFamily:  'Helvetica-Bold',
    color:       DARK,
    lineHeight:  1.2,
    marginBottom: 4,
  },
  clientName: {
    fontSize:  12,
    color:     GRAY,
    marginBottom: 2,
  },
  jobDateLine: {
    fontSize: 9,
    color:    GRAY,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  emissionLabel: {
    fontSize:      8,
    color:         GRAY,
    fontFamily:    'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom:  4,
  },
  emissionDate: {
    fontSize:   11,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },

  // ── Divisor ───────────────────────────────────────────────────────────────
  divider: {
    height:          1.5,
    backgroundColor: LINE,
    marginBottom:    20,
  },
  dividerGold: {
    height:          2,
    backgroundColor: GOLD,
    width:           40,
    marginBottom:    20,
  },

  // ── Título de seção ────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize:      8,
    fontFamily:    'Helvetica-Bold',
    color:         GOLD,
    letterSpacing: 2,
    marginBottom:  8,
  },

  // ── Tabela ─────────────────────────────────────────────────────────────────
  tableHead: {
    flexDirection:  'row',
    paddingBottom:  6,
    borderBottom:   '1px solid #e8e8e8',
    marginBottom:   4,
  },
  tableHeadText: {
    fontSize:      7,
    fontFamily:    'Helvetica-Bold',
    color:         GRAY,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingTop:    7,
    paddingBottom: 7,
    borderBottom:  '1px solid #f2f2f2',
  },
  colDesc: { flex: 1 },
  colQty:  { width: 36, textAlign: 'right' },
  colUnit: { width: 72, textAlign: 'right' },
  colVal:  { width: 80, textAlign: 'right' },
  cellText: {
    fontSize: 9,
    color:    DARK,
  },
  cellSub: {
    fontSize:   7,
    color:      GRAY,
    marginTop:  2,
  },
  receiptTag: {
    fontSize:  7,
    color:     '#2980b9',
    marginTop: 2,
  },
  subtotalRow: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    paddingTop:     8,
    marginBottom:   24,
  },
  subtotalLabel: {
    fontSize:  8,
    color:     GRAY,
    marginRight: 8,
    paddingTop:  1,
  },
  subtotalValue: {
    fontSize:  10,
    fontFamily: 'Helvetica-Bold',
    color:     DARK,
    width:     80,
    textAlign: 'right',
  },

  // ── Estado vazio da seção ──────────────────────────────────────────────────
  emptyRow: {
    paddingVertical: 10,
    marginBottom:   20,
  },
  emptyText: {
    fontSize: 8,
    color:    GRAY,
  },

  // ── Box de resumo financeiro ───────────────────────────────────────────────
  summaryBox: {
    backgroundColor: LGRAY,
    borderLeft:      '4px solid #C49A2C',
    paddingLeft:     20,
    paddingRight:    20,
    paddingTop:      18,
    paddingBottom:   18,
    borderRadius:    4,
    marginTop:       8,
  },
  summaryRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  summaryLabel: {
    fontSize: 9,
    color:    GRAY,
  },
  summaryValue: {
    fontSize:   10,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },
  summaryDivider: {
    height:          1,
    backgroundColor: LINE,
    marginVertical:  10,
  },
  summaryTotalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  summaryTotalLabel: {
    fontSize:   10,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },
  summaryTotalValue: {
    fontSize:   11,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },

  // ── A RECEBER (destaque máximo) ────────────────────────────────────────────
  dueRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      4,
  },
  dueLabel: {
    fontSize:   13,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },
  dueValue: {
    fontSize:   14,
    fontFamily: 'Helvetica-Bold',
    color:      GOLD,
  },
  dueValuePaid: {
    fontSize:   14,
    fontFamily: 'Helvetica-Bold',
    color:      GREEN,
  },

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  footer: {
    position:  'absolute',
    bottom:    32,
    left:      60,
    right:     60,
    borderTop: '1px solid #e8e8e8',
    paddingTop: 8,
    flexDirection:  'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color:    '#aaaaaa',
  },
})

// ─── Props ────────────────────────────────────────────────────────────────────

interface JobDocumentProps {
  job:          Job
  revenueItems: JobRevenueItem[]
  costItems:    JobCostItem[]
}

// ─── Documento ────────────────────────────────────────────────────────────────

export default function JobDocument({
  job,
  revenueItems,
  costItems,
}: JobDocumentProps) {
  const fin     = calcJobFinancials(job)
  const today   = todayFormatted()
  const jobDate = formatDate(job.job_date)

  // Período: multi-day mostra "Período: X a Y", single mostra "Data: X"
  const isMultiDay   = (job as Job & { is_multi_day?: boolean }).is_multi_day
  const dateStart    = (job as Job & { job_date_start?: string | null }).job_date_start
  const dateEnd      = (job as Job & { job_date_end?: string | null }).job_date_end
  const periodLabel  = isMultiDay && dateStart
    ? `Período: ${formatDate(dateStart)} a ${formatDate(dateEnd ?? '')}`
    : dateStart
      ? `Data: ${formatDate(dateStart)}`
      : jobDate !== '—' ? `Data: ${jobDate}` : null

  const slug = (job.title || 'job')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

  return (
    <Document
      title={`${job.title} — ${job.client_name || 'Cliente'}`}
      author="Lumora Finance"
      subject={`Cobrança · ${slug}`}
    >
      <Page size="A4" style={S.page}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.headerLabel}>COBRANÇA DE JOB</Text>
            <Text style={S.jobTitle}>{job.title || 'Job sem título'}</Text>
            <Text style={S.clientName}>{job.client_name || 'Cliente não informado'}</Text>
            {periodLabel && (
              <Text style={S.jobDateLine}>{periodLabel}</Text>
            )}
          </View>
          <View style={S.headerRight}>
            <Text style={S.emissionLabel}>EMISSÃO</Text>
            <Text style={S.emissionDate}>{today}</Text>
          </View>
        </View>

        <View style={S.dividerGold} />

        {/* ── SERVIÇOS ──────────────────────────────────────────────────────── */}
        <Text style={S.sectionTitle}>SERVIÇOS</Text>

        {revenueItems.length > 0 ? (
          <>
            <View style={S.tableHead}>
              <Text style={[S.tableHeadText, S.colDesc]}>DESCRIÇÃO</Text>
              <Text style={[S.tableHeadText, S.colQty]}>QTD</Text>
              <Text style={[S.tableHeadText, S.colUnit]}>UNIT.</Text>
              <Text style={[S.tableHeadText, S.colVal]}>TOTAL</Text>
            </View>

            {revenueItems.map(item => {
              const { category, text } = parseDesc(item.description)
              return (
                <View key={item.id} style={S.tableRow}>
                  <View style={S.colDesc}>
                    <Text style={S.cellText}>{text || item.description}</Text>
                    {category && (
                      <Text style={S.cellSub}>{category}</Text>
                    )}
                  </View>
                  <Text style={[S.cellText, S.colQty]}>{item.quantity}</Text>
                  <Text style={[S.cellText, S.colUnit]}>
                    {formatMoney(item.unit_value, job.currency)}
                  </Text>
                  <Text style={[S.cellText, S.colVal]}>
                    {formatMoney(item.total_value, job.currency)}
                  </Text>
                </View>
              )
            })}

            <View style={S.subtotalRow}>
              <Text style={S.subtotalLabel}>Subtotal serviços</Text>
              <Text style={S.subtotalValue}>{formatMoney(fin.revenue, job.currency)}</Text>
            </View>
          </>
        ) : (
          <View style={S.emptyRow}>
            <Text style={S.emptyText}>Nenhum serviço registrado.</Text>
          </View>
        )}

        {/* ── REPASSES AO CLIENTE ───────────────────────────────────────────── */}
        <Text style={S.sectionTitle}>REPASSES AO CLIENTE</Text>
        <Text style={{ fontSize: 7, color: GRAY, marginBottom: 8 }}>
          Valores pagos em nome do cliente e reembolsáveis.
        </Text>

        {costItems.length > 0 ? (
          <>
            <View style={S.tableHead}>
              <Text style={[S.tableHeadText, S.colDesc]}>DESCRIÇÃO</Text>
              <Text style={[S.tableHeadText, S.colQty]}>QTD</Text>
              <Text style={[S.tableHeadText, S.colUnit]}>UNIT.</Text>
              <Text style={[S.tableHeadText, S.colVal]}>TOTAL</Text>
            </View>

            {costItems.map(item => (
              <View key={item.id} style={S.tableRow}>
                <View style={S.colDesc}>
                  <Text style={S.cellText}>{item.description}</Text>
                  {/* Future: receipt_url — já tipado, aguardando migration 006 */}
                  {item.receipt_url && (
                    <Text style={S.receiptTag}>Comprovante disponível</Text>
                  )}
                </View>
                <Text style={[S.cellText, S.colQty]}>{item.quantity}</Text>
                <Text style={[S.cellText, S.colUnit]}>
                  {formatMoney(item.unit_value, job.currency)}
                </Text>
                <Text style={[S.cellText, S.colVal]}>
                  {formatMoney(item.total_value, job.currency)}
                </Text>
              </View>
            ))}

            <View style={S.subtotalRow}>
              <Text style={S.subtotalLabel}>Subtotal repasses</Text>
              <Text style={S.subtotalValue}>{formatMoney(fin.cost, job.currency)}</Text>
            </View>
          </>
        ) : (
          <View style={S.emptyRow}>
            <Text style={S.emptyText}>Nenhum repasse registrado.</Text>
          </View>
        )}

        {/* ── Resumo financeiro ─────────────────────────────────────────────── */}
        <View style={S.divider} />
        <View style={S.summaryBox}>

          {/* Serviços */}
          <View style={S.summaryRow}>
            <Text style={S.summaryLabel}>Serviços</Text>
            <Text style={S.summaryValue}>{formatMoney(fin.revenue, job.currency)}</Text>
          </View>

          {/* Repasses (só se existirem) */}
          {fin.cost > 0 && (
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>Repasses</Text>
              <Text style={S.summaryValue}>{formatMoney(fin.cost, job.currency)}</Text>
            </View>
          )}

          {/* Total */}
          <View style={S.summaryTotalRow}>
            <Text style={S.summaryTotalLabel}>Total do Job</Text>
            <Text style={S.summaryTotalValue}>{formatMoney(fin.total, job.currency)}</Text>
          </View>

          <View style={S.summaryDivider} />

          {/* Recebido (só se > 0) */}
          {fin.received > 0 && (
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>
                Recebido {fin.total > 0
                  ? `(${Math.round((fin.received / fin.total) * 100)}%)`
                  : ''}
              </Text>
              <Text style={[S.summaryValue, { color: GREEN }]}>
                {formatMoney(fin.received, job.currency)}
              </Text>
            </View>
          )}

          {/* A RECEBER — destaque */}
          <View style={S.dueRow}>
            <Text style={S.dueLabel}>A Receber</Text>
            <Text style={fin.due <= 0 ? S.dueValuePaid : S.dueValue}>
              {fin.due <= 0 ? 'PAGO' : formatMoney(fin.due, job.currency)}
            </Text>
          </View>
        </View>

        {/* ── Rodapé ────────────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>Lumora Finance</Text>
          <Text style={S.footerText}>
            {job.title || 'Job'} · Emitido em {today}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
