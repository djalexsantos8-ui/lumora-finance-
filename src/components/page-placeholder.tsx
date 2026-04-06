interface PagePlaceholderProps {
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
  badgeColor?: 'gold' | 'gray' | 'blue'
}

export default function PagePlaceholder({
  icon,
  title,
  description,
  badge,
  badgeColor = 'gray',
}: PagePlaceholderProps) {
  const badgeColors = {
    gold: 'bg-[#D4A853]/10 text-[#D4A853] border-[#D4A853]/20',
    gray: 'bg-[#1c1c1c] text-[#525252] border-[#2a2a2a]',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }

  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Ícone */}
        <div className="w-16 h-16 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mx-auto mb-6">
          <span className="text-[#D4A853]">{icon}</span>
        </div>

        {/* Badge */}
        {badge && (
          <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border mb-4 ${badgeColors[badgeColor]}`}>
            {badge}
          </span>
        )}

        {/* Título */}
        <h1 className="text-xl font-semibold text-white mb-3">{title}</h1>

        {/* Descrição */}
        <p className="text-[#a3a3a3] text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
