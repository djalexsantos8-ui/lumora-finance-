import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import type { Order, OrderItem } from '@/types/order'
import type { WorkspaceSettings } from '@/types/workspace-settings'
import { formatDate } from '@/lib/utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────

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

// ─── estilos ──────────────────────────────────────────────────────────────

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

  header: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    marginBottom:     30,
    paddingBottom:    16,
    borderBottom:     `1.5px solid ${LIGHT}`,
  },
  brand: {
    fontSize:   14,
    fontFamily: 'Helvetica-Bold',
    color:      DARK,
    letterSpacing: 0.5,
  },
  brandImage: {
    width: 100,
    height: 30,
    objectFit: 'contain',
  },
  label: {
    fontSize:   9,
    color:      GOLD,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Helvetica-Bold',
  },

  title: {
    fontSize:     22,
    fontFamily:   'Helvetica-Bold',
    color:        DARK,
    marginTop:    4,
    marginBottom: 24,
  },

  metaBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#fafafa',
    borderLeft: `3px solid ${GOLD}`,
  },
  metaCol: {
    flexDirection: 'column',
    gap: 4,
  },
  metaLabel: {
    fontSize: 8,
    color:    GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 11,
    color:    DARK,
    fontFamily: 'Helvetica-Bold',
  },

  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize:   10,
    color:      GOLD,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  paragraph: {
    fontSize:   10.5,
    color:      DARK,
    lineHeight: 1.5,
  },

  itemsTable: {
    marginTop: 8,
    border: `1px solid ${LIGHT}`,
  },
  itemsHeader: {
    flexDirection: 'row',
    backgroundColor: '#f6f6f6',
    borderBottom: `1px solid ${LIGHT}`,
    padding: 8,
  },
  itemsRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottom: `1px solid ${LIGHT}`,
  },
  col1: { flex: 5, fontSize: 9.5, color: DARK },
  col2: { flex: 1, fontSize: 9.5, color: DARK, textAlign: 'right' },
  col3: { flex: 2, fontSize: 9.5, color: DARK, textAlign: 'right' },
  col4: { flex: 2, fontSize: 9.5, color: DARK, textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  totalBlock: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: DARK,
  },
  totalLabel: {
    color: WHITE,
    fontSize: 11,
    marginRight: 12,
    letterSpacing: 0.5,
  },
  totalValue: {
    color: GOLD,
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },

  footer: {
    position: 'absolute',
    bottom: 30,
    left: 60,
    right: 60,
    fontSize: 8,
    color: GRAY,
    textAlign: 'center',
  },
})

interface Props {
  order:    Order
  items:    OrderItem[]
  settings: WorkspaceSettings | null
}

export default function OrderDocument({ order, items, settings }: Props) {
  const currency = order.currency || 'BRL'
  const businessName = settings?.company_name ?? 'Lumora Finance'

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* header */}
        <View style={S.header}>
          <View>
            {settings?.company_logo_url ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={settings.company_logo_url} style={S.brandImage} />
            ) : (
              <Text style={S.brand}>{businessName}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.label}>Pedido</Text>
            <Text style={{ fontSize: 9, color: GRAY, marginTop: 4 }}>
              #{order.id.slice(0, 8)}
            </Text>
          </View>
        </View>

        {/* título */}
        <Text style={S.title}>{order.title || 'Pedido sem título'}</Text>

        {/* meta */}
        <View style={S.metaBlock}>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>Cliente</Text>
            <Text style={S.metaValue}>{order.client_name || '—'}</Text>
          </View>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>Data do pedido</Text>
            <Text style={S.metaValue}>
              {order.order_date_end && order.is_multi_day
                ? `${formatDate(order.order_date_start || order.order_date)} → ${formatDate(order.order_date_end)}`
                : formatDate(order.order_date)}
            </Text>
          </View>
          {order.event_date && (
            <View style={S.metaCol}>
              <Text style={S.metaLabel}>Data do evento</Text>
              <Text style={S.metaValue}>{formatDate(order.event_date)}</Text>
            </View>
          )}
          {order.delivery_date && (
            <View style={S.metaCol}>
              <Text style={S.metaLabel}>Entrega</Text>
              <Text style={S.metaValue}>{formatDate(order.delivery_date)}</Text>
            </View>
          )}
        </View>

        {/* descrição do projeto */}
        {order.project_description && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Descrição do projeto</Text>
            <Text style={S.paragraph}>{order.project_description}</Text>
          </View>
        )}

        {/* entregáveis */}
        {order.deliverables && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Entregáveis</Text>
            <Text style={S.paragraph}>{order.deliverables}</Text>
          </View>
        )}

        {/* itens */}
        {items.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Itens</Text>
            <View style={S.itemsTable}>
              <View style={S.itemsHeader}>
                <Text style={[S.col1, { fontFamily: 'Helvetica-Bold' }]}>Descrição</Text>
                <Text style={[S.col2, { fontFamily: 'Helvetica-Bold' }]}>Qtd</Text>
                <Text style={[S.col3, { fontFamily: 'Helvetica-Bold' }]}>Valor</Text>
                <Text style={[S.col4, { fontFamily: 'Helvetica-Bold' }]}>Total</Text>
              </View>
              {items.map(it => (
                <View key={it.id} style={S.itemsRow}>
                  <Text style={S.col1}>{it.description}</Text>
                  <Text style={S.col2}>{Number(it.quantity)}</Text>
                  <Text style={S.col3}>{formatMoney(Number(it.unit_value), currency)}</Text>
                  <Text style={S.col4}>{formatMoney(Number(it.total_value), currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* condição de pagamento */}
        {order.payment_condition && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Condição de pagamento</Text>
            <Text style={S.paragraph}>{order.payment_condition}</Text>
          </View>
        )}

        {/* observações */}
        {order.notes && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Observações</Text>
            <Text style={S.paragraph}>{order.notes}</Text>
          </View>
        )}

        {/* total */}
        <View style={S.totalBlock}>
          <Text style={S.totalLabel}>VALOR TOTAL</Text>
          <Text style={S.totalValue}>
            {formatMoney(Number(order.amount) || 0, currency)}
          </Text>
        </View>

        {/* footer */}
        <Text style={S.footer} fixed>
          {businessName} · Emitido em {formatDate(new Date().toISOString().slice(0, 10))}
        </Text>
      </Page>
    </Document>
  )
}
