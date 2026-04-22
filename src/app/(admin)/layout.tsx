import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth/is-admin'
import AdminShell from '@/components/admin/admin-shell'

export const dynamic = 'force-dynamic'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const check = await checkAdmin()

  if (!check.isAdmin) {
    // Usuário não autenticado → /login. Autenticado sem grant → /dashboard.
    if (check.reason === 'not_authenticated') redirect('/login')
    redirect('/dashboard')
  }

  return (
    <AdminShell email={check.email} grantType={check.grantType}>
      {children}
    </AdminShell>
  )
}
