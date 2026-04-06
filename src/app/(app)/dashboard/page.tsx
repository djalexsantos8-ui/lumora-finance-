import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">
          LUMORA <span className="text-[#D4A853]">FINANCE</span>
        </h1>
        <p className="text-[#a3a3a3] mb-1">Dashboard em construção 🚧</p>
        <p className="text-[#525252] text-sm">
          Logado como <span className="text-white">{user.email}</span>
        </p>
      </div>
    </div>
  )
}
