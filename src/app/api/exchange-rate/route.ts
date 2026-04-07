import { NextResponse } from 'next/server'

const SUPPORTED = ['USD', 'EUR']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const currency = (searchParams.get('currency') ?? '').toUpperCase()

  if (!SUPPORTED.includes(currency)) {
    return NextResponse.json({ error: 'Moeda não suportada para busca automática.' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`, {
      next: { revalidate: 3600 }, // cache por 1 hora
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const rate: number | undefined = data?.rates?.BRL

    if (!rate || typeof rate !== 'number') {
      return NextResponse.json({ error: 'Taxa BRL não encontrada.' }, { status: 502 })
    }

    return NextResponse.json({
      currency,
      rate: Math.round(rate * 10000) / 10000, // 4 casas decimais
      base: 'BRL',
      timestamp: data?.time_last_update_utc ?? null,
    })
  } catch (err) {
    console.error('[exchange-rate]', err)
    return NextResponse.json({ error: 'Falha ao buscar cotação.' }, { status: 502 })
  }
}
