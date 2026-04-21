// ─── Contratos — templates iniciais (pente fino 2026-04-21) ──────────────────
//
// Templates de ARRANQUE, não de produção. Geração assistida por IA, com
// lacunas `{{placeholder}}` pra o usuário completar com dados do cliente /
// projeto (razão social, CNPJ, escopo, valores, prazos).
//
// DISCLAIMER OBRIGATÓRIO: esses textos NÃO substituem assessoria jurídica.
// O componente que renderiza já exibe o aviso em destaque — se você mover
// a renderização pra outro lugar, mantenha o disclaimer junto.
//
// V1 = texto puro (copiar → colar → editar no Word/Docs). V2 futura: merge
// automático com dados do orçamento + cliente + PDF gerado.

export type ContractCategory =
  | 'wedding_photo'
  | 'wedding_video'
  | 'institutional_video'
  | 'institutional_photo'
  | 'fashion_photo'
  | 'book_photo'
  | 'event_photo'
  | 'event_video'
  | 'freelance_b2b'

export interface ContractTemplate {
  id:          ContractCategory
  title:       string
  audience:    'pf' | 'pj' | 'any'
  summary:     string
  // Texto bruto — usuário copia, cola no editor de texto e substitui os
  // `{{placeholder}}` com dados do cliente. Mantemos português formal e
  // cláusulas comuns que cobrem 80% dos casos de estúdios brasileiros.
  body:        string
}

// Cláusulas comuns — reutilizadas em vários templates pra evitar duplicação.
const CL_PRIVACIDADE = `**Privacidade e Proteção de Dados (LGPD)** — As partes comprometem-se a tratar os dados pessoais coletados exclusivamente para fins de execução deste contrato, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).`

const CL_FORO = `**Foro** — Fica eleito o foro da comarca de {{cidade_contratada}}, com renúncia expressa a qualquer outro, para dirimir quaisquer dúvidas ou controvérsias decorrentes deste contrato.`

const CL_RESCISAO = `**Rescisão** — O presente contrato poderá ser rescindido por qualquer das partes mediante comunicação por escrito, com antecedência mínima de {{dias_aviso_previo}} dias, sujeito às condições de reembolso e multas previstas na cláusula de pagamento.`

const CL_ASSINATURAS = `**E por estarem assim justos e contratados**, as partes assinam o presente em duas vias de igual teor.

{{cidade_contratada}}, {{data_assinatura}}.

_____________________________________
CONTRATANTE: {{contratante_nome}}
{{contratante_documento}}

_____________________________________
CONTRATADA: {{contratada_razao_social}}
CNPJ: {{contratada_cnpj}}`

// ────────────────────────────────────────────────────────────────────────────

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id:       'wedding_photo',
    title:    'Fotografia de Casamento',
    audience: 'pf',
    summary:  'Cobertura fotográfica de cerimônia e recepção. Inclui entrega digital e direitos autorais.',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA DE CASAMENTO**

Pelo presente instrumento particular, de um lado **{{contratante_nome}}**, CPF {{contratante_cpf}}, residente em {{contratante_endereco}}, doravante denominado(a) CONTRATANTE;

E de outro lado, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante denominada CONTRATADA;

Têm entre si justo e contratado o seguinte:

**1. Objeto** — A CONTRATADA prestará serviços de fotografia para o evento de casamento do(a) CONTRATANTE, a realizar-se em **{{data_evento}}**, no local **{{local_evento}}**.

**2. Escopo da cobertura** — A cobertura inclui: {{escopo_coberura}} (ex.: making of da noiva, cerimônia, recepção, até {{horas_cobertura}} horas de cobertura contínua).

**3. Entrega** — A CONTRATADA entregará **{{qtd_fotos}}** fotografias tratadas em alta resolução, em formato digital, no prazo de **{{prazo_entrega}}** dias corridos após a data do evento, via galeria online.

**4. Valor e forma de pagamento** — O valor total dos serviços é de **R$ {{valor_total}}** ({{valor_por_extenso}}), pago da seguinte forma: {{condicao_pagamento}} (ex.: 50% na assinatura e 50% em até 7 dias antes do evento).

**5. Cancelamento** — Em caso de cancelamento pelo CONTRATANTE com mais de 60 dias de antecedência, a CONTRATADA reterá {{pct_multa_cancelamento}}% do valor já pago a título de multa e reserva de agenda.

**6. Direitos autorais** — Os direitos autorais das fotografias pertencem à CONTRATADA. O CONTRATANTE recebe licença de uso pessoal e familiar, vedada a exploração comercial. A CONTRATADA poderá utilizar as imagens em seu portfólio e redes sociais.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'wedding_video',
    title:    'Vídeo de Casamento',
    audience: 'pf',
    summary:  'Cobertura audiovisual de casamento com entrega de filme principal e trailer.',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE VÍDEO DE CASAMENTO**

Pelo presente instrumento particular, de um lado **{{contratante_nome}}**, CPF {{contratante_cpf}}, residente em {{contratante_endereco}}, doravante denominado(a) CONTRATANTE;

E de outro lado, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante denominada CONTRATADA;

Têm entre si justo e contratado o seguinte:

**1. Objeto** — Produção audiovisual do evento de casamento do(a) CONTRATANTE em **{{data_evento}}**, no local **{{local_evento}}**.

**2. Escopo** — A cobertura inclui: {{horas_cobertura}} horas contínuas, com {{qtd_cameras}} câmeras e {{qtd_operadores}} operadores. Captação de áudio dos votos e momentos principais.

**3. Entregáveis**
   a) Filme principal editado de **{{duracao_filme}}** minutos;
   b) Trailer de **{{duracao_trailer}}** segundos para compartilhamento em redes sociais;
   c) {{extras_entregaveis}} (ex.: arquivos brutos, versão cerimônia completa).

**4. Prazo de entrega** — {{prazo_entrega}} dias corridos após a data do evento, via link de download ou mídia física.

**5. Valor e pagamento** — Valor total **R$ {{valor_total}}** ({{valor_por_extenso}}), conforme: {{condicao_pagamento}}.

**6. Cancelamento** — Cancelamento pelo CONTRATANTE: multa de {{pct_multa_cancelamento}}% até 60 dias antes do evento; 50% entre 60 e 30 dias; 100% do valor pago nos últimos 30 dias.

**7. Direitos de imagem e autorais** — Todos os direitos autorais pertencem à CONTRATADA. CONTRATANTE recebe licença de uso pessoal e familiar. A CONTRATADA pode usar o material em portfólio e redes sociais.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'institutional_video',
    title:    'Vídeo Institucional',
    audience: 'pj',
    summary:  'Produção de vídeo institucional para uso corporativo (site, redes, apresentações).',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PRODUÇÃO AUDIOVISUAL INSTITUCIONAL**

Pelo presente instrumento, de um lado **{{contratante_razao_social}}**, CNPJ {{contratante_cnpj}}, sede em {{contratante_endereco}}, representada por {{contratante_responsavel}}, cargo {{contratante_cargo}}, doravante CONTRATANTE;

E **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante CONTRATADA;

**1. Objeto** — Produção de vídeo institucional com duração de **{{duracao_video}}**, para uso em {{canais_uso}} (ex.: site, YouTube, redes sociais, apresentações internas).

**2. Escopo** — Inclui: roteiro, pré-produção, {{qtd_diarias}} diária(s) de gravação em {{locacoes}}, edição, trilha, locução e finalização em formatos {{formatos_entrega}}.

**3. Aprovações** — O CONTRATANTE terá direito a **{{qtd_rodadas_revisao}}** rodadas de revisão. Alterações adicionais serão cobradas a R$ {{valor_rodada_extra}} por rodada.

**4. Prazo de entrega** — {{prazo_entrega_dias}} dias úteis após aprovação do roteiro e término das gravações.

**5. Valor e pagamento** — Valor total **R$ {{valor_total}}** ({{valor_por_extenso}}), a ser pago conforme: {{condicao_pagamento}} (ex.: 40% na assinatura, 30% no início das gravações, 30% na entrega final).

**6. Licença de uso** — A CONTRATADA cede ao CONTRATANTE licença **{{escopo_licenca}}** (ex.: perpétua e irrestrita / limitada a 2 anos / territorial Brasil) para uso nos canais definidos na cláusula 1. Direitos autorais das imagens brutas permanecem com a CONTRATADA.

**7. Confidencialidade** — Ambas as partes se comprometem a manter sigilo sobre informações estratégicas, financeiras e operacionais trocadas durante a execução do contrato.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'institutional_photo',
    title:    'Fotografia Institucional',
    audience: 'pj',
    summary:  'Ensaio fotográfico corporativo: equipe, ambientes, produtos.',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA INSTITUCIONAL**

De um lado **{{contratante_razao_social}}**, CNPJ {{contratante_cnpj}}, representada por {{contratante_responsavel}}, CONTRATANTE;

E **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, CONTRATADA;

**1. Objeto** — Realização de ensaio fotográfico institucional envolvendo **{{escopo_fotografico}}** (ex.: retratos de equipe, ambientes corporativos, produtos, eventos internos).

**2. Escopo e logística** — {{qtd_diarias}} diária(s) de {{horas_por_diaria}} horas, em {{locacoes}}, com {{qtd_fotografos}} fotógrafo(s) e {{equipamento_adicional}}.

**3. Entregáveis** — **{{qtd_fotos_tratadas}}** fotografias tratadas em alta resolução, entregues em até **{{prazo_entrega}}** dias úteis após a última diária, via galeria online.

**4. Revisões** — Até **{{qtd_revisoes}}** fotos poderão ser re-tratadas sem custo adicional. Alterações adicionais a R$ {{valor_revisao_extra}} por foto.

**5. Valor e pagamento** — Valor total **R$ {{valor_total}}**, pago conforme: {{condicao_pagamento}}.

**6. Licença de uso** — O CONTRATANTE adquire licença **{{escopo_licenca}}** para uso institucional nos canais previstos. Os direitos autorais permanecem com a CONTRATADA. Uso em mídia paga requer termo adicional.

**7. Cessão de imagem de colaboradores** — O CONTRATANTE é responsável por obter autorização de uso de imagem dos colaboradores fotografados, entregando à CONTRATADA cópia dos termos assinados.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'fashion_photo',
    title:    'Fotografia de Moda',
    audience: 'any',
    summary:  'Ensaio de moda (editorial, e-commerce, lookbook).',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA DE MODA**

De um lado **{{contratante_nome_ou_razao}}**, {{contratante_documento}}, CONTRATANTE;

E **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, CONTRATADA;

**1. Objeto** — Produção fotográfica de {{tipo_ensaio}} (ex.: editorial, campanha, lookbook, e-commerce) com **{{qtd_looks}}** looks, em {{locacoes}}, na(s) data(s) de {{datas_producao}}.

**2. Escopo** — Inclui: {{equipe_producao}} (ex.: 1 fotógrafo, 1 assistente, modelo contratada à parte), {{equipamento_cenografico}} e backup de arquivos.

**3. Modelos e produção** — A contratação de modelos, styling, beauty e cenografia é de responsabilidade do CONTRATANTE, salvo menção em contrário em {{adendo_producao}}.

**4. Entregáveis** — **{{qtd_fotos_finais}}** fotos tratadas em alta resolução + {{qtd_fotos_para_redes}} versões otimizadas para redes sociais, entregues em até **{{prazo_entrega}}** dias úteis.

**5. Valor e pagamento** — R$ {{valor_total}}, pago conforme: {{condicao_pagamento}}.

**6. Licença de uso** — Licença {{escopo_licenca}} para uso em {{canais_uso}} pelo prazo de **{{prazo_licenca}}** (ex.: 1 ano, renovável). Uso fora do escopo requer termo adicional. Direitos autorais permanecem com a CONTRATADA.

**7. Uso em portfólio** — A CONTRATADA poderá divulgar o material em portfólio, site e redes sociais, salvo embargo expresso do CONTRATANTE com prazo mínimo de **{{meses_embargo}}** meses.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'book_photo',
    title:    'Fotografia para Book / Ensaio Pessoal',
    audience: 'pf',
    summary:  'Ensaio pessoal, book fotográfico, gestante, família.',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENSAIO FOTOGRÁFICO PESSOAL**

De um lado **{{contratante_nome}}**, CPF {{contratante_cpf}}, residente em {{contratante_endereco}}, CONTRATANTE;

E **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, CONTRATADA;

**1. Objeto** — Realização de ensaio fotográfico pessoal ({{tipo_ensaio}}: book, gestante, família, 15 anos, etc.) em **{{data_ensaio}}**, no local **{{local_ensaio}}**, com duração aproximada de **{{duracao_horas}}** horas.

**2. Escopo** — Inclui direção de pose, orientação de figurino (sem styling profissional), tratamento de imagens e galeria digital.

**3. Entregáveis** — **{{qtd_fotos_finais}}** fotografias tratadas, entregues em galeria online em até **{{prazo_entrega}}** dias úteis. Fotos adicionais selecionadas a R$ {{valor_foto_extra}} por foto.

**4. Valor e pagamento** — R$ {{valor_total}}, conforme: {{condicao_pagamento}} (ex.: 50% na reserva, 50% no dia do ensaio).

**5. Reagendamento** — Em caso de impossibilidade do CONTRATANTE comparecer na data agendada, é permitido UM (1) reagendamento sem custo, com aviso mínimo de 72h. Reagendamentos adicionais sujeitos a taxa de R$ {{taxa_reagendamento}}.

**6. Direitos autorais** — Permanecem com a CONTRATADA. O CONTRATANTE recebe licença de uso pessoal e familiar. Uso comercial requer termo adicional.

**7. Uso em portfólio** — A CONTRATADA poderá usar o material em portfólio e redes sociais, salvo embargo expresso.

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'event_photo',
    title:    'Fotografia de Evento',
    audience: 'any',
    summary:  'Cobertura fotográfica de evento (aniversário, formatura, corporativo, confraternização).',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA DE EVENTO**

De um lado **{{contratante_nome_ou_razao}}**, {{contratante_documento}}, CONTRATANTE;

E **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, CONTRATADA;

**1. Objeto** — Cobertura fotográfica do evento **{{nome_evento}}**, em **{{data_evento}}**, no local **{{local_evento}}**, com duração aproximada de **{{horas_cobertura}}** horas.

**2. Escopo** — Cobertura do evento incluindo {{escopo_cobertura}} (ex.: chegada de convidados, cerimônia, coquetel, pronunciamentos).

**3. Entregáveis** — **{{qtd_fotos_tratadas}}** fotografias tratadas em alta resolução, entregues via galeria online em até **{{prazo_entrega}}** dias úteis.

**4. Valor e pagamento** — R$ {{valor_total}}, conforme: {{condicao_pagamento}}.

**5. Hora extra** — Cobertura além das {{horas_cobertura}} horas contratadas será cobrada a **R$ {{valor_hora_extra}}** por hora adicional.

**6. Cancelamento** — Cancelamento com mais de 30 dias: multa de {{pct_multa_long}}%. Entre 30 e 7 dias: 50%. Nos 7 dias anteriores: 100%.

**7. Direitos autorais** — Permanecem com a CONTRATADA. O CONTRATANTE recebe licença de uso não-comercial. A CONTRATADA pode usar o material em portfólio.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'event_video',
    title:    'Vídeo de Evento',
    audience: 'any',
    summary:  'Cobertura audiovisual de eventos (corporativos, shows, formaturas).',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE COBERTURA AUDIOVISUAL DE EVENTO**

De um lado **{{contratante_nome_ou_razao}}**, {{contratante_documento}}, CONTRATANTE;

E **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, CONTRATADA;

**1. Objeto** — Cobertura audiovisual do evento **{{nome_evento}}**, em **{{data_evento}}**, no local **{{local_evento}}**, com duração de **{{horas_cobertura}}** horas.

**2. Escopo** — Cobertura com {{qtd_cameras}} câmeras, captação de áudio (mesa, microfone de palco, ambiente) e {{equipamento_adicional}} (ex.: drone, slider, iluminação adicional).

**3. Entregáveis**
   a) Vídeo principal editado de **{{duracao_final}}**;
   b) {{extras_entregaveis}} (ex.: aftermovie de 60s, cortes de palestras, arquivos brutos).

**4. Prazo** — {{prazo_entrega}} dias úteis após o evento.

**5. Valor e pagamento** — R$ {{valor_total}}, conforme: {{condicao_pagamento}}.

**6. Licença de uso** — Licença {{escopo_licenca}} para uso em {{canais_uso}}. Direitos autorais das imagens brutas permanecem com a CONTRATADA.

**7. Cessão de imagem de participantes** — O CONTRATANTE é responsável por comunicar aos participantes que o evento será gravado, obtendo autorizações necessárias de imagem quando aplicável.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
  {
    id:       'freelance_b2b',
    title:    'Freelance B2B (Subcontratação)',
    audience: 'pj',
    summary:  'Contratação de freelancer (fotógrafo, videomaker, editor) para compor equipe em projeto.',
    body: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS AUDIOVISUAIS FREELANCE (B2B)**

De um lado **{{contratante_razao_social}}**, CNPJ {{contratante_cnpj}}, representada por {{contratante_responsavel}}, doravante CONTRATANTE;

E **{{freelancer_nome}}**, {{freelancer_documento}} (CPF ou CNPJ MEI), doravante CONTRATADO;

**1. Objeto** — O CONTRATADO prestará serviços de **{{funcao}}** (ex.: segundo fotógrafo, operador de câmera, editor, colorista) no projeto **{{nome_projeto}}** do CONTRATANTE.

**2. Escopo e cronograma** — {{qtd_diarias}} diária(s), nas datas {{datas_execucao}}, em {{locacoes}}. Carga horária por diária: {{horas_por_diaria}} horas, com hora extra a {{valor_hora_extra}}.

**3. Entregáveis** — O CONTRATADO entregará os arquivos {{formato_arquivos}} ao CONTRATANTE em até **{{prazo_entrega_material}}** após cada diária, via {{metodo_entrega}}.

**4. Valor e pagamento** — Valor total **R$ {{valor_total}}** ({{valor_por_extenso}}), pago conforme: {{condicao_pagamento}} (ex.: 100% em até 15 dias após entrega e emissão de NF).

**5. Cessão total de direitos autorais** — O CONTRATADO cede ao CONTRATANTE, em caráter **universal, total, exclusivo e irrevogável**, todos os direitos patrimoniais sobre o material produzido no escopo deste contrato. O CONTRATANTE poderá utilizar, editar, modificar e explorar comercialmente o material sem limitação de tempo, território ou mídia.

**6. Uso em portfólio** — É permitido ao CONTRATADO utilizar o material em portfólio profissional após {{meses_portfolio}} meses da entrega, mediante crédito visível e sem expor informações estratégicas do cliente final do CONTRATANTE.

**7. Confidencialidade** — O CONTRATADO compromete-se a manter sigilo sobre informações do cliente final, estratégias de produção e quaisquer dados sensíveis acessados durante a execução do contrato.

**8. Natureza da contratação** — Este contrato é de prestação de serviços autônomos, não configurando vínculo empregatício, societário ou de qualquer natureza diversa da aqui prevista. O CONTRATADO é responsável por seus tributos e obrigações legais.

${CL_RESCISAO}

${CL_PRIVACIDADE}

${CL_FORO}

${CL_ASSINATURAS}`,
  },
]

export function getContractTemplate(id: ContractCategory): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find(t => t.id === id)
}
