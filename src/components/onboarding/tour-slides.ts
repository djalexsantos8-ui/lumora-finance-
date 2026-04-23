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
    tagline: 'Sua inteligência comercial e financeira em uma tela.',
    body: 'KPIs de faturamento, lucro e pipeline em tempo real. Narrativa explicando o que está acontecendo no seu negócio — sem você precisar abrir planilha.',
    status: 'live',
    color: 'gold',
  },
  {
    id: 'budgets',
    title: 'Orçamentos',
    tagline: 'Propostas profissionais em minutos, com IA.',
    body: 'Monte orçamentos com cálculo de margem automático e PDFs que seus clientes respeitam. Use IA pra montar a base e você só ajusta.',
    highlight: '100 gerações de IA inclusas por mês',
    status: 'live',
    color: 'amber',
  },
  {
    id: 'freelances',
    title: 'Freelances',
    tagline: 'Execução, entregas e status dos seus trabalhos.',
    body: 'Cada job vira um projeto com receita, custos, pagamentos e arquivos. Lucro real por projeto — não o que o cliente pagou menos um chute.',
    status: 'live',
    color: 'teal',
  },
  {
    id: 'orders',
    title: 'Pedidos',
    tagline: 'Demandas repetitivas de clientes recorrentes.',
    body: 'Pedidos avulsos dentro de uma conta — ideal pra quem atende agências ou marcas com fluxo mensal irregular.',
    status: 'live',
    color: 'sky',
  },
  {
    id: 'recurring',
    title: 'Receita Recorrente',
    tagline: 'Contratos mensais com previsibilidade.',
    body: 'Social media, conteúdo mensal, assessoria. Veja MRR, churn e faturamento previsto. Base de um negócio sustentável.',
    status: 'live',
    color: 'emerald',
  },
  {
    id: 'contracts',
    title: 'Contratos',
    tagline: 'Centralize o comercial — gere, assine, arquive.',
    body: 'Gerador de contratos a partir de orçamentos e jobs aprovados. Templates prontos pra quem vive de vídeo e conteúdo.',
    status: 'live',
    color: 'indigo',
  },
  {
    id: 'costs',
    title: 'Custos',
    tagline: 'Despesas + custos fixos = lucro real.',
    body: 'Alugueis, SaaS, folha, equipamento. Separe o que é custo da empresa do que é custo do projeto — a conta final fica honesta.',
    status: 'live',
    color: 'rose',
  },
  {
    id: 'clients',
    title: 'Clientes',
    tagline: 'Sua base comercial com histórico real.',
    body: 'Cada cliente guarda propostas, projetos, contratos e pagamentos. Na hora de precificar o próximo trampo, você tem dados — não achismo.',
    status: 'live',
    color: 'violet',
  },
  {
    id: 'insights',
    title: 'Insights',
    tagline: 'Educação financeira e comercial pra filmmaker.',
    body: 'Conteúdo, cursos e materiais pra você entender margem, precificação, pipeline e fluxo de caixa no jeito de quem vive de audiovisual.',
    highlight: 'Incluso no plano — acesso progressivo',
    status: 'preview',
    color: 'orange',
  },
  {
    id: 'settings',
    title: 'Configurações',
    tagline: 'Branding, empresa e o operacional do dia a dia.',
    body: 'Logo, dados da empresa, assinatura, rodapé dos PDFs. Ajuste a plataforma pra soar como você. Você sempre pode voltar aqui.',
    status: 'live',
    color: 'slate',
  },
]
