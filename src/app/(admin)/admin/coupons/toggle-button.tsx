'use client'

import { useTransition, useState } from 'react'
import { toggleCouponActiveAction } from './actions'

export default function ToggleButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => {
          setErr(null)
          start(async () => {
            const res = await toggleCouponActiveAction(id)
            if (!res.ok) setErr(res.error)
          })
        }}
        className={`text-[10px] px-2 py-0.5 rounded tracking-wider uppercase font-medium transition-colors ${
          active
            ? 'bg-[#2a2a2a] hover:bg-red-500/20 text-[#a3a3a3] hover:text-red-300'
            : 'bg-[#2a2a2a] hover:bg-emerald-500/20 text-[#a3a3a3] hover:text-emerald-300'
        } disabled:opacity-50`}
      >
        {pending ? '...' : active ? 'desativar' : 'reativar'}
      </button>
      {err && <span className="text-[10px] text-red-400" title={err}>erro</span>}
    </div>
  )
}
