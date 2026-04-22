import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import type { RecurringRevenueInvoice } from '@/types/recurring-revenue'
import type { WorkspaceSettings } from '@/types/workspace-settings'
import { getCurrencyDecimals, getCurrencySymbol } from '@/lib/utils/format'

// ─── MonthlyInvoiceDocument ─────────────────────────────────────────────────
//
// Documento PDF de cobrança mensal gerada a partir de uma receita recorrente
// (Fase 4 / 2026-04-22). Visual alinhado com `contract-document` e
// `budget-document`: palette gold/dark/gray, Helvetica, cabeçalho com logo
// da empresa + eyebrow "COBRANÇA" dourado.
//
// Conteúdo em 1 página:
//   · Cabeçalho com logo/empresa + eyebrow "COBRANÇA"
//   · Período de competência (mês/ano) em destaque
//   · Descritivo (title + cliente)
//   · Valor total + vencimento
//   · Status (aberta / paga)
//   · Observações (se houver)
//   · Rodapé com CNPJ/contato da empresa

const GOLD   = '#C49A2C'
const DARK   = '#1a1a1a'
const GRAY   = '#6b6b6b'
const LIGHT  = '#e8e8e8'
const WHITE  = '#ffffff'
const EMERALD = '#059669'

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
] as const

const S = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    paddingTop:      60,
    paddingBottom:   70,
    paddingLeft:     60,
    paddingRight:    60,
    fontFamily:      'Helvetica',
  },

  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   28,
    paddingBottom:  20,
    borderBottom:   `1.5px solid ${LIGHT}`,
  },
  companyBlock: { flexDirection: 'column' },
  companyName: {
    fontSize:      12,
    fontFamily:    'Helvetica-Bold',
    color:         DARK,
    letterSpacing: 0.6,
  },
  companyMeta: {
    fontSize:  9,
    color:     GRAY,
    marginTop: 2,
  },
  docLabel: {
    fontSize:      10,
    fontFamily:    'Helvetica-Bold',
    color:         GOLD,
    letterSpacing: 2,
    textAlign:     'right',
  },
  docSubLabel: {
    fontSize:  9,
    color:     GRAY,
    marginTop: 2,
    textAlign: 'right',
  },

  periodRow: {
    marginTop:    6,
    marginBottom: 28,
  },
  periodLabel: {
    fontSize:      8,
    color:         GRAY,
    letterSpacing: 1.6,
    marginBottom:  6,
  },
  periodValue: {
    fontSize:   30,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },

  card: {
    border:       `1px solid ${LIGHT}`,
    borderRadius: 6,
    padding:      24,
    marginBottom: 18,
  },
  cardLabel: {
    fontSize:      8,
    color:         GRAY,
    letterSpacing: 1.2,
    marginBottom:  6,
  },
  cardValueLg: {
    fontSize:   22,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },
  cardValueMd: {
    fontSize:   14,
    fontFamily: 'Helvetica',
    color:      DARK,
  },
  row: {
    flexDirection: 'row',
    marginBottom:  12,
  },
  rowCell: {
    flexGrow: 1,
    flexBasis: 0,
  },

  statusPill: {
    alignSelf:    'flex-start',
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius: 12,
    fontSize:     9,
    fontFamily:   'Helvetica-Bold',
    letterSpacing: 1,
  },

  notes: {
    fontSize:     10,
    color:        DARK,
    lineHeight:   1.5,
    marginTop:    4,
  },

  footer: {
    position:     'absolute',
    bottom:       30,
    left:         60,
    right:        60,
    fontSize:     8,
    color:        GRAY,
    textAlign:    'center',
    paddingTop:   12,
    borderTop:    `0.8px solid ${LIGHT}`,
  },
})

interface Props {
  invoice:  RecurringRevenueInvoice
  settings: WorkspaceSettings | null
}

function fmtMoney(amount: number, currency: string) {
  const prefix = getCurrencySymbol(currency)
  const digits = getCurrencyDecimals(currency)
  return `${prefix} ${amount.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function MonthlyInvoiceDocument({ invoice, settings }: Props) {
  const period = `${MONTHS_PT[invoice.period_month - 1]} / ${invoice.period_year}`

  const companyName =
    settings?.company_name ??
    settings?.company_legal_name ??
    'Sua Empresa'

  const companyDoc =
    settings?.company_cnpj
      ? `CNPJ ${settings.company_cnpj}`
      : settings?.company_cpf
        ? `CPF ${settings.company_cpf}`
        : ''

  const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
    open:      { label: 'EM ABERTO',  color: '#9a6a00', bg: '#fff4d6' },
    paid:      { label: 'PAGA',       color: '#047857', bg: '#d1fae5' },
    overdue:   { label: 'ATRASADA',   color: '#991b1b', bg: '#fee2e2' },
    cancelled: { label: 'CANCELADA',  color: '#4b5563', bg: '#e5e7eb' },
  }
  const stMeta = statusMeta[invoice.status] ?? statusMeta.open

  return (
    <Document
      title={`Cobrança ${period}`}
      author={companyName}
      subject="Cobrança de serviços"
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={S.header} fixed>
          <View style={S.companyBlock}>
            {settings?.company_logo_url ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={settings.company_logo_url} style={{ width: 120, height: 40, objectFit: 'contain' }} />
            ) : (
              <Text style={S.companyName}>{companyName}</Text>
            )}
            {companyDoc && <Text style={S.companyMeta}>{companyDoc}</Text>}
          </View>
          <View>
            <Text style={S.docLabel}>COBRANÇA</Text>
            <Text style={S.docSubLabel}>Emitida em {new Date().toLocaleDateString('pt-BR')}</Text>
          </View>
        </View>

        {/* ── Período ───────────────────────────────────────────────── */}
        <View style={S.periodRow}>
          <Text style={S.periodLabel}>PERÍODO DE COMPETÊNCIA</Text>
          <Text style={S.periodValue}>{period}</Text>
        </View>

        {/* ── Cliente + descrição ───────────────────────────────────── */}
        <View style={S.card}>
          <Text style={S.cardLabel}>REFERENTE A</Text>
          <Text style={S.cardValueMd}>{invoice.title}</Text>
          {invoice.client_name && (
            <>
              <Text style={[S.cardLabel, { marginTop: 14 }]}>CLIENTE</Text>
              <Text style={S.cardValueMd}>{invoice.client_name}</Text>
            </>
          )}
        </View>

        {/* ── Valor + vencimento + status ───────────────────────────── */}
        <View style={S.card}>
          <View style={S.row}>
            <View style={S.rowCell}>
              <Text style={S.cardLabel}>VALOR</Text>
              <Text style={S.cardValueLg}>
                {fmtMoney(Number(invoice.amount), invoice.currency)}
              </Text>
            </View>
            <View style={S.rowCell}>
              <Text style={S.cardLabel}>VENCIMENTO</Text>
              <Text style={S.cardValueLg}>{fmtDate(invoice.due_date)}</Text>
            </View>
          </View>

          <View style={[S.row, { marginBottom: 0 }]}>
            <View style={S.rowCell}>
              <Text style={S.cardLabel}>STATUS</Text>
              <Text style={[S.statusPill, { color: stMeta.color, backgroundColor: stMeta.bg }]}>
                {stMeta.label}
              </Text>
            </View>
            {invoice.paid_at && (
              <View style={S.rowCell}>
                <Text style={S.cardLabel}>PAGAMENTO CONFIRMADO</Text>
                <Text style={[S.cardValueMd, { color: EMERALD }]}>
                  {fmtDate(invoice.paid_at)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Observações ─────────────────────────────────────────── */}
        {invoice.notes && (
          <View style={S.card}>
            <Text style={S.cardLabel}>OBSERVAÇÕES</Text>
            <Text style={S.notes}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Footer ──────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text>
            {companyName}
            {companyDoc ? ` · ${companyDoc}` : ''}
            {settings?.company_email ? ` · ${settings.company_email}` : ''}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
