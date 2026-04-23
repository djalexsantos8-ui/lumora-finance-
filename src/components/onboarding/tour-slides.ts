// ─── Product Tour · slides ──────────────────────────────────────────────────
//
// 10 slides que apresentam o valor de cada aba do Lumora Finance. Copy curta,
// intencional — o objetivo é ativação, não documentação. Cada slide tem:
//   · title       → nome da aba (igual ao sidebar)
//   · tagline     → 1 linha de posicionamento
//   · body        → 1–2 linhas explicando o valor concreto
//   · highlight   → (opcional) bullet premium (ex: "100 gerações IA inclusas")
//   · status      → 'live' | 'preview' — honestidade sobre o que já existe
//   · icon        → mini SVG do mesmo vocabulário do sidebar
//
// Regra: copy premium, sem jargão. Filmmaker entende em 5 segundos.

export interface TourSlide {
  id:        string
  title:     string
  tagline:   string
  body:      string
  highlight?: string
  status:    'live' | 'preview'
  color:     'gold' | 'teal' | 'violet' | 'rose' | 'emerald' | 'amber' | 'sky' | 'indigo' | 'orange' | 'slate'
}

export const TOUR_SLIDES: TourSlide[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    tagline: 'A saúde do seu negócio em uma tela só.',
    body: 'Faturamento, lucro, pipeline e caixa previsto — atualizado na hora. Uma narrativa curta explica o que mudou esta semana, sem planilha.',
    status: 'live',
    color: 'gold',
  },
  {
    id: 'budgets',
    title: 'Orçamentos',
    tagline: 'Propostas profissionais em minutos, com ajuda de IA.',
    body: 'Monte orçamentos com cálculo de margem automático e PDFs bem feitos. A IA rascunha a base a partir de uma descrição curta — você só ajusta.',
    highlight: '100 gerações de IA por mês inclusas',
    status: 'live',
    color: 'amber',
  },
  {
    id: 'freelances',
    title: 'Freelances',
    tagline: 'Cada trampo de fotografia e audiovisual virando projeto.',
    body: 'Receita, custos, pagamentos e arquivos de cada freela em um lugar só. O lucro real aparece sozinho — sem precisar chutar.',
    status: 'live',
    color: 'teal',
  },
  {
    id: 'orders',
    title: 'Pedidos',
    tagline: 'Demandas avulsas de clientes recorrentes.',
    body: 'Ideal pra quem atende agências ou marcas com fluxo irregular: cada pedido entra rápido, vincula ao cliente e soma no caixa do mês.',
    status: 'live',
    color: 'sky',
  },
  {
    id: 'recurring',
    title: 'Receita Recorrente',
    tagline: 'Contratos mensais com previsibilidade real.',
    body: 'Social media, conteúdo mensal, assessoria. Você vê o faturamento previsto pros próximos meses e o quanto entra fixo — a base de um negócio que dorme tranquilo.',
    status: 'live',
    color: 'emerald',
  },
  {
    id: 'contracts',
    title: 'Contratos',
    tagline: 'Gere, assine e arquive sem sair do Lumora.',
    body: 'Contratos a partir de orçamentos e freelances aprovados. Templates prontos pensados pra quem vive de fotografia e audiovisual.',
    status: 'live',
    color: 'indigo',
  },
  {
    id: 'costs',
    title: 'Custos',
    tagline: 'Despesas + custos fixos = lucro real.',
    body: 'Aluguéis, SaaS, folha, equipamento. Separe o que é custo da empresa do que é custo do projeto — a conta do mês fica honesta.',
    status: 'live',
    color: 'rose',
  },
  {
    id: 'clients',
    title: 'Clientes',
    tagline: 'Sua base comercial com histórico real.',
    body: 'Cada cliente guarda propostas, projetos, contratos e pagamentos. Na hora de precificar o próximo trabalho, você tem dados — não achismo.',
    status: 'live',
    color: 'violet',
  },
  {
    id: 'insights',
    title: 'Insights',
    tagline: 'Educação financeira e comercial pra filmmaker.',
    body: 'Artigos, guias e vídeos sobre margem, precificação, pipeline e fluxo de caixa — na linguagem de quem vive de fotografia e audiovisual.',
    highlight: 'Incluso no plano',
    status: 'live',
    color: 'orange',
  },
  {
    id: 'settings',
    title: 'Configurações',
    tagline: 'Branding, empresa e o operacional do dia a dia.',
    body: 'Logo, dados da empresa, assinatura, rodapé dos PDFs, impostos. Ajuste pra soar como você — pode voltar quando quiser.',
    status: 'live',
    color: 'slate',
  },
]
