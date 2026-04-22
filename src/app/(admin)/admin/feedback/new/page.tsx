import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ManualForm from './manual-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Novo feedback — Admin' }

export default async function NewFeedbackPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <Link href="/admin/feedback" className="text-xs text-[#a3a3a3] hover:text-white">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold mt-2">Adicionar feedback manualmente</h1>
        <p className="text-sm text-[#737373] mt-1">
          Use para registrar conversas de DM, Whatsapp, call que não entraram pelo widget.
        </p>
      </div>
      <ManualForm />
    </div>
  )
}
