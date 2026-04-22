import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import type { Contract } from '@/types/contract'
import type { WorkspaceSettings } from '@/types/workspace-settings'
import {
  parseContractMarkdown,
  type ContractBlock,
  type ContractInline,
} from '@/lib/contracts/markdown-parse'

// ─── Constantes visuais (match com budget-document) ─────────────────────────

const GOLD   = '#C49A2C'
const DARK   = '#1a1a1a'
const GRAY   = '#6b6b6b'
const LIGHT  = '#e8e8e8'
const WHITE  = '#ffffff'

const S = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    paddingTop:    60,
    paddingBottom: 70,
    paddingLeft:   60,
    paddingRight:  60,
    fontFamily: 'Helvetica',
  },

  // ── header (página 2+) ──
  pageHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   24,
    paddingBottom:  16,
    borderBottom:   '1.5px solid #e8e8e8',
  },
  pageHeaderCompany: {
    fontSize:      10,
    fontFamily:    'Helvetica-Bold',
    color:         DARK,
    letterSpacing: 0.5,
  },
  pageHeaderLabel: {
    fontSize:  9,
    color:     GRAY,
    textAlign: 'right',
  },

  // ── capa ──
  coverCompanyBlock: {
    position:   'absolute',
    top:        60,
    right:      60,
    alignItems: 'flex-end',
  },
  coverCompanyName: {
    fontSize:      11,
    fontFamily:    'Helvetica-Bold',
    color:         DARK,
    letterSpacing: 0.5,
  },
  coverLogo: {
    width:        70,
    height:       70,
    objectFit:    'contain',
    marginBottom: 48,
  },
  coverEyebrow: {
    fontSize:      10,
    fontFamily:    'Helvetica-Bold',
    color:         GOLD,
    letterSpacing: 4,
    marginBottom:  16,
    textTransform: 'uppercase',
  },
  coverTitle: {
    fontSize:      30,
    fontFamily:    'Helvetica-Bold',
    color:         DARK,
    letterSpacing: -0.5,
    lineHeight:    1.2,
    marginBottom:  12,
  },
  coverSubtitle: {
    fontSize:     14,
    color:        GRAY,
    lineHeight:   1.4,
    marginBottom: 40,
  },
  coverDivider: {
    height:          2,
    backgroundColor: GOLD,
    width:           48,
    marginBottom:    40,
  },
  coverMetaRow: {
    flexDirection: 'row',
    gap:           16,
    marginBottom:  10,
  },
  coverMetaLabel: {
    fontSize:      9,
    color:         GRAY,
    width:         90,
    fontFamily:    'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  coverMetaValue: {
    fontSize:   11,
    color:      DARK,
    flex:       1,
    fontFamily: 'Helvetica',
  },

  // ── corpo ──
  h1: {
    fontSize:      16,
    fontFamily:    'Helvetica-Bold',
    color:         DARK,
    letterSpacing: -0.2,
    marginTop:     20,
    marginBottom:  12,
    lineHeight:    1.3,
  },
  h2: {
    fontSize:      12,
    fontFamily:    'Helvetica-Bold',
    color:         GOLD,
    letterSpacing: 1,
    marginTop:     14,
    marginBottom:  6,
    textTransform: 'uppercase',
  },
  paragraph: {
    fontSize:     11,
    color:        DARK,
    lineHeight:   1.65,
    marginBottom: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    marginBottom:  4,
  },
  listBullet: {
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: GOLD,
    marginTop:       6,
    marginRight:     10,
    flexShrink:      0,
  },
  listText: {
    flex:       1,
    fontSize:   11,
    color:      DARK,
    lineHeight: 1.65,
  },

  // ── footer ──
  footerText: {
    position:   'absolute',
    bottom:     40,
    left:       60,
    right:      60,
    fontSize:   8,
    color:      GRAY,
    textAlign:  'center',
    lineHeight: 1.5,
  },
  pageNumber: {
    position:   'absolute',
    bottom:     24,
    left:       60,
    right:      60,
    fontSize:   8,
    color:      '#bdbdbd',
    textAlign:  'center',
  },
})

// ─── Inline renderer (bold + normal) ────────────────────────────────────────

function InlineText({ parts }: { parts: ContractInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        )
      )}
    </>
  )
}

// ─── Block renderer ─────────────────────────────────────────────────────────

function BlockView({ block }: { block: ContractBlock }) {
  switch (block.type) {
    case 'h1':
      return (
        <Text style={S.h1}>
          <InlineText parts={block.content} />
        </Text>
      )
    case 'h2':
      return (
        <Text style={S.h2}>
          <InlineText parts={block.content} />
        </Text>
      )
    case 'paragraph':
      return (
        <Text style={S.paragraph}>
          <InlineText parts={block.content} />
        </Text>
      )
    case 'list-item':
      return (
        <View style={S.listItem}>
          <View style={S.listBullet} />
          <Text style={S.listText}>
            <InlineText parts={block.content} />
          </Text>
        </View>
      )
    case 'blank':
      return <View style={{ height: 6 }} />
    default:
      return null
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ContractDocumentProps {
  contract: Contract
  settings: WorkspaceSettings | null
  contractTypeLabel: string
}

// ─── Documento ──────────────────────────────────────────────────────────────

export default function ContractDocument({
  contract,
  settings,
  contractTypeLabel,
}: ContractDocumentProps) {
  const companyName = settings?.company_name ?? settings?.company_legal_name ?? null
  const logoUrl     = settings?.company_logo_url ?? null
  const footer      = settings?.footer_text ?? null

  const createdAt = new Date(contract.updated_at || contract.created_at)
  const createdFormatted = `${String(createdAt.getDate()).padStart(2, '0')}/${
    String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`

  // Parse markdown → blocos estruturados (seguro, puro)
  const blocks = parseContractMarkdown(contract.rendered_content ?? '')

  // Separar blocos em "chunks" para permitir paginação natural do PDF
  // (react-pdf quebra automaticamente em <Page wrap>, mas agrupa melhor
  // se blocos consecutivos fluírem como um único View).

  return (
    <Document
      title={contract.title}
      author={companyName ?? 'Lumora Finance'}
      subject="Contrato"
    >
      {/* ── PÁGINA 1: CAPA ─────────────────────────────────────────────── */}
      <Page size="A4" style={S.page}>
        {companyName && (
          <View style={S.coverCompanyBlock}>
            <Text style={S.coverCompanyName}>{companyName.toUpperCase()}</Text>
          </View>
        )}

        {logoUrl ? (
          <Image src={logoUrl} style={S.coverLogo} />
        ) : (
          <View style={{ height: 48 }} />
        )}

        <Text style={S.coverEyebrow}>Contrato</Text>
        <Text style={S.coverTitle}>{contract.title}</Text>
        <Text style={S.coverSubtitle}>{contractTypeLabel}</Text>
        <View style={S.coverDivider} />

        <View style={S.coverMetaRow}>
          <Text style={S.coverMetaLabel}>DATA</Text>
          <Text style={S.coverMetaValue}>{createdFormatted}</Text>
        </View>

        {footer && (
          <Text style={S.footerText}>{footer}</Text>
        )}
      </Page>

      {/* ── PÁGINAS 2+: CORPO DO CONTRATO ──────────────────────────────── */}
      <Page size="A4" style={S.page} wrap>
        <View fixed>
          <View style={S.pageHeader}>
            <Text style={S.pageHeaderCompany}>
              {(companyName ?? 'CONTRATO').toUpperCase()}
            </Text>
            <Text style={S.pageHeaderLabel}>{contract.title}</Text>
          </View>
        </View>

        <View>
          {blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </View>

        {footer && (
          <Text style={S.footerText} fixed>{footer}</Text>
        )}
        <Text
          style={S.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  )
}
