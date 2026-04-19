import Link from 'next/link'

interface NewJobButtonProps {
  label?: string
}

export function NewJobButton({ label = 'Novo Job' }: NewJobButtonProps) {
  return (
    <Link
      href="/jobs/new"
      className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shrink-0"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      {label}
    </Link>
  )
}
