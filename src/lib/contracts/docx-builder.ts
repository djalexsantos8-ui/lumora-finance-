// ─── Builder DOCX de contratos ─────────────────────────────────────────────
//
// Gera um arquivo .docx editável no Word/LibreOffice a partir do markdown
// renderizado pelo resolver. Usa `docx` (v9+) — bibliotecas puras sem deps
// nativas. Importado dinamicamente no API route para não inflar o bundle
// client.

import type { Contract } from '@/types/contract'
import type { WorkspaceSettings } from '@/types/workspace-settings'
import {
  parseContractMarkdown,
  type ContractInline,
} from './markdown-parse'

const GOLD = 'C49A2C'
const DARK = '1A1A1A'
const GRAY = '6B6B6B'

// Base text options (compatível com IRunOptions do docx)
interface BaseRunOptions {
  size?: number
  color?: string
  bold?: boolean
  font?: string
  characterSpacing?: number
}

/**
 * Converte inline segments em TextRuns (docx).
 */
function inlineToRuns(
  parts: ContractInline[],
  docx: typeof import('docx'),
  baseOptions: BaseRunOptions = {}
) {
  return parts.map(
    p =>
      new docx.TextRun({
        size: baseOptions.size,
        color: baseOptions.color,
        font: baseOptions.font,
        characterSpacing: baseOptions.characterSpacing,
        text: p.text,
        bold: p.bold || baseOptions.bold,
      })
  )
}

interface BuildDocxOptions {
  contract: Contract
  settings: WorkspaceSettings | null
  contractTypeLabel: string
}

/**
 * Retorna um Buffer com o DOCX pronto para download.
 */
export async function buildContractDocx({
  contract,
  settings,
  contractTypeLabel,
}: BuildDocxOptions): Promise<Buffer> {
  // Import dinâmico — mantém o bundle do client enxuto
  const docx = await import('docx')
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageNumber,
    Footer,
    Header,
  } = docx

  const companyName =
    settings?.company_name ?? settings?.company_legal_name ?? 'Lumora Finance'
  const footerText = settings?.footer_text ?? ''

  const createdAt = new Date(contract.updated_at || contract.created_at)
  const createdFormatted = `${String(createdAt.getDate()).padStart(2, '0')}/${
    String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`

  const blocks = parseContractMarkdown(contract.rendered_content ?? '')

  // ── CAPA ───────────────────────────────────────────────────────────────
  const coverChildren: import('docx').Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: companyName.toUpperCase(),
          bold: true,
          size: 20, // half-points => 10pt
          color: DARK,
        }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 1200 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'CONTRATO',
          bold: true,
          size: 20,
          color: GOLD,
          characterSpacing: 80,
        }),
      ],
      spacing: { before: 200, after: 200 },
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: contract.title,
          bold: true,
          size: 56, // 28pt
          color: DARK,
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: contractTypeLabel,
          size: 24,
          color: GRAY,
        }),
      ],
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Data: ${createdFormatted}`,
          size: 20,
          color: DARK,
        }),
      ],
      spacing: { after: 200 },
    }),
  ]

  // ── CORPO ──────────────────────────────────────────────────────────────
  const bodyChildren: import('docx').Paragraph[] = []
  for (const b of blocks) {
    if (b.type === 'blank') {
      bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
      continue
    }
    if (b.type === 'h1') {
      bodyChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: inlineToRuns(b.content, docx, {
            bold: true,
            size: 32,
            color: DARK,
          }),
          spacing: { before: 400, after: 200 },
        })
      )
      continue
    }
    if (b.type === 'h2') {
      bodyChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: inlineToRuns(b.content, docx, {
            bold: true,
            size: 24,
            color: GOLD,
          }),
          spacing: { before: 300, after: 120 },
        })
      )
      continue
    }
    if (b.type === 'list-item') {
      bodyChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          children: inlineToRuns(b.content, docx, {
            size: 22,
            color: DARK,
          }),
          spacing: { after: 80 },
        })
      )
      continue
    }
    // paragraph
    bodyChildren.push(
      new Paragraph({
        children: inlineToRuns(b.content, docx, {
          size: 22, // 11pt
          color: DARK,
        }),
        spacing: { after: 160, line: 320 }, // line-height ~1.5
      })
    )
  }

  // ── Page break entre capa e corpo ─────────────────────────────────────
  const doc = new Document({
    creator: companyName,
    title: contract.title,
    description: 'Contrato gerado automaticamente pelo Lumora Finance',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: DARK },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1200,
              right: 1200,
            },
          },
        },
        children: coverChildren,
      },
      {
        properties: {
          page: {
            margin: {
              top: 1200,
              bottom: 1200,
              left: 1200,
              right: 1200,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: companyName.toUpperCase(),
                    bold: true,
                    size: 18,
                    color: DARK,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: footerText ? `${footerText}  ·  ` : '',
                    size: 16,
                    color: GRAY,
                  }),
                  new TextRun({
                    children: ['Página ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: GRAY,
                  }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  })

  return await Packer.toBuffer(doc)
}
