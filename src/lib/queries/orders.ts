// ─── Queries de orders (somente leitura, chamadas de Server Components) ──
//
// Mesmo padrão de `contracts.ts`: reads puros FORA de 'use server', para
// evitar qualquer acoplamento entre render SSR e a boundary de Server Actions
// do Next 16 + Turbopack. Cada função retorna shape seguro em falhas.

import { createClient } from '@/lib/supabase/server'
import type { OrderItem, OrderCostItem, OrderFile } from '@/types/order'

function isTableMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined
  return (
    e?.code === '42P01' ||
    !!e?.message?.includes('does not exist') ||
    !!e?.message?.includes('relation "public.order_items"') ||
    !!e?.message?.includes('relation "public.order_cost_items"') ||
    !!e?.message?.includes('relation "public.order_files"')
  )
}

export async function listOrderItemsQuery(
  orderId: string
): Promise<{ items: OrderItem[]; tableMissing: boolean }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      if (isTableMissing(error)) return { items: [], tableMissing: true }
      console.warn('[listOrderItemsQuery] query error:', error.message)
      return { items: [], tableMissing: false }
    }
    return { items: (data ?? []) as unknown as OrderItem[], tableMissing: false }
  } catch (err) {
    console.error('[listOrderItemsQuery] unexpected error:', err)
    return { items: [], tableMissing: false }
  }
}

export async function listOrderCostItemsQuery(
  orderId: string
): Promise<{ items: OrderCostItem[]; tableMissing: boolean }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('order_cost_items')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      if (isTableMissing(error)) return { items: [], tableMissing: true }
      console.warn('[listOrderCostItemsQuery] query error:', error.message)
      return { items: [], tableMissing: false }
    }
    return { items: (data ?? []) as unknown as OrderCostItem[], tableMissing: false }
  } catch (err) {
    console.error('[listOrderCostItemsQuery] unexpected error:', err)
    return { items: [], tableMissing: false }
  }
}

export async function listOrderFilesQuery(
  orderId: string
): Promise<{ files: OrderFile[]; tableMissing: boolean }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('order_files')
      .select('*')
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) {
      if (isTableMissing(error)) return { files: [], tableMissing: true }
      console.warn('[listOrderFilesQuery] query error:', error.message)
      return { files: [], tableMissing: false }
    }
    return { files: (data ?? []) as OrderFile[], tableMissing: false }
  } catch (err) {
    console.error('[listOrderFilesQuery] unexpected error:', err)
    return { files: [], tableMissing: false }
  }
}
