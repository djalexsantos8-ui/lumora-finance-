// ─── Parser de markdown minimalista para contratos ─────────────────────────
//
// Os templates em src/lib/contracts/templates.ts usam um subset seguro de MD:
//   · títulos com **bold** como primeira linha (h1 implícito)
//   · subtítulos/cláusulas iniciadas com **bold** seguido de em-dash
//   · parágrafos soltos
//   · linhas em branco separam blocos
//
// Este parser é puro (sem deps), determinístico e seguro para renderização
// em react-pdf e docx. Rejeita tags HTML e qualquer coisa "perigosa" — só
// texto e **bold**.

export type ContractInline =
  | { bold: false; text: string }
  | { bold: true;  text: string }

export type ContractBlock =
  | { type: 'h1';         content: ContractInline[] }
  | { type: 'h2';         content: ContractInline[] }
  | { type: 'paragraph';  content: ContractInline[] }
  | { type: 'list-item';  content: ContractInline[] }
  | { type: 'blank' }

/**
 * Quebra inline em segmentos bold/normal a partir de uma string com **foo**.
 * Ignora HTML e caracteres de controle. Mantém ordem e quebras de linha.
 */
export function parseInline(line: string): ContractInline[] {
  const out: ContractInline[] = []
  if (!line) return out

  // Remove tags HTML simples (defesa em profundidade)
  const safe = line.replace(/<[^>]*>/g, '')

  const regex = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = regex.exec(safe))) {
    if (m.index > lastIndex) {
      out.push({ bold: false, text: safe.slice(lastIndex, m.index) })
    }
    out.push({ bold: true, text: m[1] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < safe.length) {
    out.push({ bold: false, text: safe.slice(lastIndex) })
  }
  return out
}

/**
 * Converte o markdown renderizado pelo resolver em blocos tipados.
 *
 * Regras:
 *  · 1ª linha não-vazia do documento com **…** → h1
 *  · Linha que começa com **…** e curta (< 80 chars sem ponto final) → h2
 *  · Linha iniciada por "- " ou "· " → list-item
 *  · Linha em branco → blank
 *  · Demais → paragraph
 */
export function parseContractMarkdown(md: string): ContractBlock[] {
  if (!md) return []

  // Normaliza quebras de linha
  const lines = md.replace(/\r\n?/g, '\n').split('\n')

  const blocks: ContractBlock[] = []
  let sawTitle = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!trimmed) {
      blocks.push({ type: 'blank' })
      continue
    }

    // Lista
    if (/^[-·]\s+/.test(trimmed)) {
      const inner = trimmed.replace(/^[-·]\s+/, '')
      blocks.push({ type: 'list-item', content: parseInline(inner) })
      continue
    }

    const isWrappedBold = /^\*\*([\s\S]+?)\*\*\.?$/.test(trimmed)

    // Título principal — primeira linha em negrito
    if (!sawTitle && isWrappedBold) {
      sawTitle = true
      blocks.push({ type: 'h1', content: parseInline(trimmed) })
      continue
    }

    // Subtítulo / cláusula — linha começa com **X** — (em-dash/hífen)
    // ou a linha é curta e só tem bold
    if (/^\*\*[^*]+\*\*\s*[—–-]/.test(trimmed) ||
        (isWrappedBold && trimmed.length < 80)) {
      blocks.push({ type: 'h2', content: parseInline(trimmed) })
      continue
    }

    blocks.push({ type: 'paragraph', content: parseInline(trimmed) })
  }

  // Compacta múltiplos blanks consecutivos para no máximo um
  const compact: ContractBlock[] = []
  for (const b of blocks) {
    if (b.type === 'blank' && compact[compact.length - 1]?.type === 'blank') continue
    compact.push(b)
  }
  return compact
}
