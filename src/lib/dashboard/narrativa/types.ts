// ─── Camada Narrativa — Schema + Formatadores ───────────────────────────────
//
// CAMADA PURA. Zero fetch. Zero side effect. Zero mudança em agregador.
//
// RESPONSABILIDADE:
//   Transformar os outputs dos 7 agregadores (números crus) em texto que um
//   fotógrafo/filmmaker entenda sem precisar saber ler dashboard.
//
// GRAMÁTICA N1 → N4 (inspirada no modelo Lumiere):
//
//   N1 · VEREDICTO     "O que tá acontecendo?"
//                      Uma pergunta + tese curta + nuance + prova numérica.
//
//   N2 · KPIs          "Quais números provam?"
//                      Cada KPI vem com sub-label educativa e trend.
//                      (Educação é INLINE com o número — não tooltip.)
//
//   N3 · EVIDÊNCIA     "Onde olhar dentro disso?"
//                      Descobertas — fatos concretos com número, mistos de
//                      dimensão FINANCEIRA e COMERCIAL:
//                        financeira — "sua margem tá fina"
//                        comercial  — "cliente X te rende mais margem"
//
//   N4 · LEITURA       "O que isso significa pra decisão?"
//                      Parágrafo de 2–4 frases em linguagem humana.
//
// REGRAS DE VOZ (leia antes de escrever qualquer string):
//
//   ✅ Pergunta em 2ª pessoa: "Você está ganhando dinheiro este mês?"
//   ✅ Tese curta colorida:    "Sim." / "Quase." / "Não."
//   ✅ Prova com número:       "R$ 12.300 de lucro · margem 28%"
//   ✅ Metáfora concreta:      "de cada R$ 100 que entra, R$ 28 são seus"
//   ✅ Oposição explícita:     "mas", "porém", "só que"
//
//   ❌ Jargão:      YTD, MoM, breakeven, runway (sem tradução)
//   ❌ Vago:        "sua concentração está elevada"
//   ❌ Subjuntivo:  "recomendamos que considere..."
//   ❌ Coach:       "observa-se uma tendência..."
//   ❌ Genérico:    "acompanhe seus indicadores"

// ─── Taxonomia ────────────────────────────────────────────────────────────────

export type Tom       = 'positivo' | 'atencao' | 'critico'
export type Dimensao  = 'financeira' | 'comercial'

// ─── Blocos da narrativa ──────────────────────────────────────────────────────

/** N1 — o veredicto de 1 linha da aba. */
export interface Veredicto {
  pergunta: string   // ex: "Você está ganhando dinheiro este mês?"
  tese:     string   // ex: "Sim."  ·  curta, colorida
  nuance:   string   // ex: "Mas depende demais de um cliente."
  prova:    string   // ex: "R$ 12.300 de lucro · margem 28%"
  tom:      Tom
}

/** N4 — parágrafo executivo de 2–4 frases, linguagem humana. */
export interface Leitura {
  paragrafo: string
  tom:       Tom
}

/** Descoberta — fato concreto com número e ângulo (financeiro ou comercial). */
export interface Descoberta {
  codigo:    string       // estável, ex: 'D_MELHOR_CLIENTE'
  texto:     string       // sempre com número, 1–2 frases
  gravidade: Tom
  dimensao:  Dimensao     // financeira = saúde · comercial = onde apertar
}

/** Sub-label dum KPI — é AQUI que a educação mora, co-localizada com o número. */
export interface Sublabel {
  label:    string        // "Receita do mês"
  sublabel: string        // "O que caiu na conta · ticket médio R$ 3.800"
  trend?:   string        // "↑ 12% vs mês passado"  (opcional — só quando faz sentido)
}

/** Aba inteira empacotada pra UI renderizar. */
export interface AbaNarrativa {
  veredicto:   Veredicto
  leitura:     Leitura
  descobertas: Descoberta[]                  // ordenadas por gravidade, corta em 5
  sublabels:   Record<string, Sublabel>      // chave = identificador do KPI
}

// ─── Formatadores (compartilhados entre todas as abas) ───────────────────────

/** R$ 12.300 — sem centavos (ruído visual em painel executivo). */
export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    maximumFractionDigits: 0,
  })
}

/** 28% — com vírgula decimal pt-BR; `casas` controla precisão. */
export function fmtPct(n: number, casas = 0): string {
  return `${n.toFixed(casas).replace('.', ',')}%`
}

/** "4 meses" / "1 mês" / "4,2 meses" — plural certo, decimal pt-BR. */
export function fmtMeses(n: number): string {
  const casas = Number.isInteger(n) ? 0 : 1
  const val   = n.toFixed(casas).replace('.', ',')
  return n === 1 ? '1 mês' : `${val} meses`
}

/** "↑ 12%" / "↓ 8%" / "·" — seta pra variação percentual. */
export function fmtDelta(pct: number): string {
  if (pct === 0) return '·'
  const seta = pct > 0 ? '↑' : '↓'
  return `${seta} ${fmtPct(Math.abs(pct), 0)}`
}

/** Ordenação de descobertas: crítico > atenção > positivo (drama importa). */
export function ordenaPorGravidade<T extends { gravidade: Tom }>(items: T[]): T[] {
  const peso: Record<Tom, number> = { critico: 0, atencao: 1, positivo: 2 }
  return [...items].sort((a, b) => peso[a.gravidade] - peso[b.gravidade])
}
