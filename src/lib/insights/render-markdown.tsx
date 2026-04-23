import React from 'react'

/**
 * Renderizador de Markdown MUITO simples — sem deps extras. Cobre:
 *   · # / ## / ### / #### (h1..h4)
 *   · **negrito** e *itálico*
 *   · [texto](url) links
 *   · listas `- ` e `* `
 *   · linhas em branco = parágrafo novo
 *   · > citação
 *   · ``` bloco de código (trivial)
 *
 * Não é CommonMark completo. É o suficiente pra posts de produto sem
 * carregar bundle do marked/markdown-it. Se um dia precisar de tabelas ou
 * imagens inline, troca por `marked` ou `react-markdown`.
 */

type Block =
  | { kind: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'blockquote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'hr' }

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) { blocks.push({ kind: 'hr' }); i++; continue }

    // Code block
    if (line.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ }
      i++ // skip closing ```
      blocks.push({ kind: 'code', text: buf.join('\n') })
      continue
    }

    // Heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length as 1|2|3|4, text: h[2].trim() })
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const buf = [line.slice(2)]
      i++
      while (i < lines.length && lines[i].startsWith('> ')) { buf.push(lines[i].slice(2)); i++ }
      blocks.push({ kind: 'blockquote', text: buf.join(' ') })
      continue
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // Paragraph (consume until blank line)
    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s|[-*]\s|```|---+\s*$)/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: 'p', text: buf.join(' ') })
  }

  return blocks
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Escape primeiro. Depois aplica regex de marcação numa string segura.
  const nodes: React.ReactNode[] = []
  let rest = text
  let k = 0

  // Regex combinada: links, bold, italic, code inline.
  const combo = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/

  while (rest.length) {
    const m = combo.exec(rest)
    if (!m) {
      nodes.push(rest)
      break
    }

    if (m.index > 0) nodes.push(rest.slice(0, m.index))

    if (m[1]) {
      // link
      nodes.push(
        <a
          key={`${keyPrefix}-l-${k++}`}
          href={m[3]}
          className="text-[#D4A853] hover:text-[#E8C47A] underline underline-offset-2"
          target={m[3].startsWith('http') ? '_blank' : undefined}
          rel={m[3].startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {m[2]}
        </a>,
      )
    } else if (m[4]) {
      nodes.push(<strong key={`${keyPrefix}-b-${k++}`} className="font-semibold text-white">{m[5]}</strong>)
    } else if (m[6]) {
      nodes.push(<em key={`${keyPrefix}-i-${k++}`}>{m[7]}</em>)
    } else if (m[8]) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${k++}`}
          className="px-1.5 py-0.5 rounded bg-[#1f1f1f] border border-[#2a2a2a] text-[#E8C47A] text-[0.85em]"
        >
          {m[9]}
        </code>,
      )
    }

    rest = rest.slice(m.index + m[0].length)
  }

  return nodes
}

export function RenderMarkdown({ children }: { children: string }) {
  const blocks = parse(children)

  return (
    <div className="space-y-5 text-[#d4d4d4] leading-relaxed">
      {blocks.map((b, idx) => {
        const key = `blk-${idx}`
        switch (b.kind) {
          case 'h': {
            const size = b.level === 1 ? 'text-2xl' : b.level === 2 ? 'text-xl' : b.level === 3 ? 'text-lg' : 'text-base'
            const Tag = (`h${b.level}`) as 'h1' | 'h2' | 'h3' | 'h4'
            return (
              <Tag key={key} className={`${size} font-bold text-white mt-6`}>
                {renderInline(b.text, key)}
              </Tag>
            )
          }
          case 'p':
            return <p key={key}>{renderInline(b.text, key)}</p>
          case 'ul':
            return (
              <ul key={key} className="list-disc pl-5 space-y-2 marker:text-[#D4A853]">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            )
          case 'blockquote':
            return (
              <blockquote
                key={key}
                className="border-l-4 border-[#D4A853] pl-4 py-1 text-[#a3a3a3] italic"
              >
                {renderInline(b.text, key)}
              </blockquote>
            )
          case 'code':
            return (
              <pre
                key={key}
                className="rounded-lg bg-[#0d0d0d] border border-[#1f1f1f] p-4 text-xs text-[#a3a3a3] overflow-x-auto"
              >
                <code>{b.text}</code>
              </pre>
            )
          case 'hr':
            return <hr key={key} className="border-[#2a2a2a]" />
        }
      })}
    </div>
  )
}
