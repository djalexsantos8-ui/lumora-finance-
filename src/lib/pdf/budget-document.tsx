import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import type { Budget, BudgetItem } from '@/types/budget'
import type { WorkspaceSettings } from '@/types/workspace-settings'
import { formatDate } from '@/lib/utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── estilos ──────────────────────────────────────────────────────────────────

const GOLD   = '#C49A2C'
const DARK   = '#1a1a1a'
const GRAY   = '#6b6b6b'
const LIGHT  = '#e8e8e8'
const WHITE  = '#ffffff'

const S = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    paddingTop:    60,
    paddingBottom: 60,
    paddingLeft:   60,
    paddingRight:  60,
    fontFamily: 'Helvetica',
  },

  // ── header comum (páginas 2 e 3) ──
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   24,
    paddingBottom:  16,
    borderBottom:   '1.5px solid #e8e8e8',
  },
  pageHeaderCompany: {
    fontSize:    10,
    fontFamily:  'Helvetica-Bold',
    color:       DARK,
    letterSpacing: 0.5,
  },
  pageHeaderLabel: {
    fontSize:  9,
    color:     GRAY,
    textAlign: 'right',
  },

  // ── capa ──────────────────────────────────────────────────────────────────
  coverLogo: {
    width:        70,
    height:       70,
    objectFit:    'contain',
    marginBottom: 48,
  },
  coverTitle: {
    fontSize:    32,
    fontFamily:  'Helvetica-Bold',
    color:       DARK,
    letterSpacing: -0.5,
    lineHeight:    1.2,
    marginBottom:  8,
  },
  coverSubtitle: {
    fontSize:    16,
    color:       GOLD,
    fontFamily:  'Helvetica-Bold',
    letterSpacing: 4,
    marginBottom: 48,
  },
  coverDivider: {
    height:      2,
    backgroundColor: GOLD,
    width:       48,
    marginBottom: 40,
  },
  coverMetaRow: {
    flexDirection: 'row',
    gap:           16,
    marginBottom:  12,
  },
  coverMetaLabel: {
    fontSize:   9,
    color:      GRAY,
    width:      80,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  coverMetaValue: {
    fontSize: 12,
    color:    DARK,
    flex:     1,
    fontFamily: 'Helvetica',
  },
  coverCompanyBlock: {
    position:  'absolute',
    top:       0,
    right:     0,
    alignItems: 'flex-end',
  },
  coverCompanyName: {
    fontSize:    11,
    fontFamily:  'Helvetica-Bold',
    color:       DARK,
    letterSpacing: 0.5,
  },

  // ── conteúdo geral ──────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize:     9,
    fontFamily:   'Helvetica-Bold',
    color:        GOLD,
    letterSpacing: 2,
    marginBottom:  8,
    textTransform: 'uppercase',
  },
  sectionDivider: {
    height:          1,
    backgroundColor: LIGHT,
    marginBottom:    16,
  },
  bodyText: {
    fontSize:    11,
    color:       DARK,
    lineHeight:  1.6,
    marginBottom: 4,
  },
  bodyTextGray: {
    fontSize:    10,
    color:       GRAY,
    lineHeight:  1.6,
  },
  section: {
    marginBottom: 32,
  },

  // ── itens visíveis no PDF ───────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    marginBottom:  8,
    gap:           8,
  },
  itemBullet: {
    width:       6,
    height:      6,
    borderRadius: 3,
    backgroundColor: GOLD,
    marginTop:   4,
    flexShrink:  0,
  },
  itemLabel: {
    fontSize: 11,
    color:    DARK,
    flex:     1,
    lineHeight: 1.4,
  },

  // ── total (destaque máximo) ──────────────────────────────────────────────────
  totalBlock: {
    backgroundColor: '#fafafa',
    borderLeft:      '4px solid #C49A2C',
    paddingLeft:     24,
    paddingTop:      24,
    paddingBottom:   24,
    paddingRight:    24,
    marginBottom:    32,
    borderRadius:    4,
  },
  totalLabel: {
    fontSize:    9,
    color:       GRAY,
    fontFamily:  'Helvetica-Bold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  totalValue: {
    fontSize:   40,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
    lineHeight:  1,
    letterSpacing: -1,
  },
  totalCaption: {
    fontSize:    9,
    color:       GRAY,
    marginTop:   6,
  },

  // ── assinatura ───────────────────────────────────────────────────────────────
  signatureBlock: {
    marginTop:  40,
    paddingTop: 16,
    borderTop:  '1px solid #e8e8e8',
  },
  signatureLine: {
    height:          1,
    width:           160,
    backgroundColor: DARK,
    marginBottom:    6,
  },
  signatureName: {
    fontSize:   11,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
  },
  signatureTitle: {
    fontSize:  10,
    color:     GRAY,
    marginTop:  2,
  },
  footerText: {
    position:  'absolute',
    bottom:    40,
    left:      60,
    right:     60,
    fontSize:  8,
    color:     GRAY,
    textAlign: 'center',
    lineHeight: 1.5,
  },
})

// ─── Props ────────────────────────────────────────────────────────────────────

interface BudgetDocumentProps {
  budget:    Budget
  settings:  WorkspaceSettings | null
  items:     BudgetItem[]   // somente os com show_in_pdf = true
}

// ─── PageHeader reutilizável ──────────────────────────────────────────────────

function PageHeader({
  companyName,
  pageLabel,
}: {
  companyName: string | null
  pageLabel:   string
}) {
  return (
    <View style={S.pageHeader}>
      <Text style={S.pageHeaderCompany}>
        {companyName ?? 'PROPOSTA COMERCIAL'}
      </Text>
      <Text style={S.pageHeaderLabel}>{pageLabel}</Text>
    </View>
  )
}

// ─── Documento ────────────────────────────────────────────────────────────────

export default function BudgetDocument({
  budget,
  settings,
  items,
}: BudgetDocumentProps) {
  const companyName = settings?.company_name ?? null
  const logoUrl     = settings?.company_logo_url ?? null
  const sigName     = settings?.signature_name ?? null
  const sigTitle    = settings?.signature_title ?? null
  const footer      = settings?.footer_text ?? null

  const visibleItems = items.filter(i => i.show_in_pdf && !i.deleted_at)

  const createdAt = new Date(budget.created_at)
  const createdFormatted = `${String(createdAt.getDate()).padStart(2, '0')}/${
    String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`

  return (
    <Document
      title={budget.title}
      author={companyName ?? 'Lumora Finance'}
      subject="Proposta Comercial"
    >
      {/* ── PÁGINA 1: CAPA ───────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        {/* Company (top-right) */}
        {companyName && (
          <View style={S.coverCompanyBlock}>
            <Text style={S.coverCompanyName}>{companyName.toUpperCase()}</Text>
          </View>
        )}

        {/* Logo */}
        {logoUrl ? (
          <Image src={logoUrl} style={S.coverLogo} />
        ) : (
          <View style={{ height: 48 }} />
        )}

        {/* Título principal */}
        <Text style={S.coverTitle}>Proposta{'\n'}Comercial</Text>
        <View style={S.coverDivider} />

        {/* Meta */}
        <View style={S.coverMetaRow}>
          <Text style={S.coverMetaLabel}>PARA</Text>
          <Text style={S.coverMetaValue}>{budget.client_name || '—'}</Text>
        </View>
        <View style={S.coverMetaRow}>
          <Text style={S.coverMetaLabel}>PROJETO</Text>
          <Text style={S.coverMetaValue}>{budget.title}</Text>
        </View>
        <View style={S.coverMetaRow}>
          <Text style={S.coverMetaLabel}>DATA</Text>
          <Text style={S.coverMetaValue}>{createdFormatted}</Text>
        </View>
        {budget.valid_until && (
          <View style={S.coverMetaRow}>
            <Text style={S.coverMetaLabel}>VÁLIDO ATÉ</Text>
            <Text style={S.coverMetaValue}>{formatDate(budget.valid_until)}</Text>
          </View>
        )}

        {/* Footer */}
        {footer && <Text style={S.footerText}>{footer}</Text>}
      </Page>

      {/* ── PÁGINA 2: SOBRE O PROJETO ────────────────────────────────────── */}
      {(budget.project_description || budget.deliverables) && (
        <Page size="A4" style={S.page}>
          <PageHeader companyName={companyName} pageLabel="Sobre o Projeto" />

          {budget.project_description && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>Descrição</Text>
              <View style={S.sectionDivider} />
              <Text style={S.bodyText}>{budget.project_description}</Text>
            </View>
          )}

          {budget.deliverables && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>Entregas</Text>
              <View style={S.sectionDivider} />
              <Text style={S.bodyText}>{budget.deliverables}</Text>
            </View>
          )}

          {budget.event_date && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>Data do Evento</Text>
              <View style={S.sectionDivider} />
              <Text style={S.bodyText}>{formatDate(budget.event_date)}</Text>
            </View>
          )}

          {footer && <Text style={S.footerText}>{footer}</Text>}
        </Page>
      )}

      {/* ── PÁGINA 3: INVESTIMENTO ───────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        <PageHeader companyName={companyName} pageLabel="Investimento" />

        {/* Itens visíveis (se existirem) */}
        {visibleItems.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>O que está incluído</Text>
            <View style={S.sectionDivider} />
            {visibleItems.map(item => (
              <View key={item.id} style={S.itemRow}>
                <View style={S.itemBullet} />
                <Text style={S.itemLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Total em destaque */}
        <View style={S.totalBlock}>
          <Text style={S.totalLabel}>INVESTIMENTO TOTAL</Text>
          <Text style={S.totalValue}>
            {formatMoney(budget.total, budget.currency)}
          </Text>
          <Text style={S.totalCaption}>
            Valor total do projeto
          </Text>
        </View>

        {/* Assinatura */}
        {(sigName || sigTitle) && (
          <View style={S.signatureBlock}>
            <View style={S.signatureLine} />
            {sigName  && <Text style={S.signatureName}>{sigName}</Text>}
            {sigTitle && <Text style={S.signatureTitle}>{sigTitle}</Text>}
          </View>
        )}

        {footer && <Text style={S.footerText}>{footer}</Text>}
      </Page>
    </Document>
  )
}
