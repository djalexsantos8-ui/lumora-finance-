// ─── DraftBadge ─────────────────────────────────────────────────────────────
// Pill visual para sinalizar freelance em rascunho (sem receita, sem custo,
// título default). Puramente visual — a decisão de mostrar é do consumidor
// via isDraftFreelance().

export function DraftBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={
        `inline-flex items-center gap-1 text-[9px] font-bold tracking-widest uppercase ` +
        `px-1.5 py-0.5 rounded-full bg-[#262626] text-[#a3a3a3] border border-[#2a2a2a] ` +
        className
      }
      title="Freelance em rascunho — adicione título, serviços ou custos"
    >
      <span className="w-1 h-1 rounded-full bg-[#525252]" />
      Rascunho
    </span>
  )
}
