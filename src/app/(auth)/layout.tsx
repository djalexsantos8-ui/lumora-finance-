export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            LUMORA <span className="text-[#D4A853]">FINANCE</span>
          </h1>
          <p className="text-[#a3a3a3] text-sm mt-1">
            Gestão financeira para criadores
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8">
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-[#525252] text-xs mt-6">
          © 2026 Lumora Finance. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
