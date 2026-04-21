// ─── Templates dos contratos ────────────────────────────────────────────────
//
// Texto bruto por tipo. Placeholders {{chave}} serão resolvidos pelo renderer
// (ver ./render.ts) usando os valores do ContractContext montado pelo resolver.
//
// Regras de redação:
//  · português formal, linguagem contratual, sem gírias
//  · cobrir os 80% mais comuns (objeto, escopo, pagamento, cancelamento,
//    entrega, direitos autorais, LGPD, foro, assinaturas)
//  · diferenciar PF/PJ quando fizer sentido (uso de CPF/CNPJ)
//  · disclaimer permanece na UI — aqui é só o corpo
//
// Co-redigido por IA, revisão humana recomendada antes do uso em valor alto.

import type { ContractType } from '@/types/contract'

// ─── Cláusulas reusáveis ────────────────────────────────────────────────────

const CL_LGPD = `**Proteção de Dados (LGPD)** — As partes comprometem-se a tratar os dados pessoais coletados exclusivamente para os fins de execução deste contrato, conforme a Lei nº 13.709/2018 (LGPD). A CONTRATADA adotará medidas técnicas e administrativas razoáveis para proteger as informações pessoais compartilhadas pelo CONTRATANTE.`

const CL_FORO = `**Foro** — Fica eleito o foro da comarca de {{cidade_foro}}, com renúncia expressa a qualquer outro, ainda que mais privilegiado, para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato.`

const CL_RESCISAO = `**Rescisão** — O presente contrato poderá ser rescindido por qualquer das partes mediante comunicação por escrito, com antecedência mínima de {{dias_aviso_previo}} dias, sujeito às condições de reembolso e multas previstas na cláusula de pagamento.`

const CL_ASSINATURAS = `E por estarem assim justos e contratados, as partes assinam o presente em duas vias de igual teor e forma.

{{cidade_foro}}, {{data_assinatura}}.

_______________________________________
CONTRATANTE: {{contratante_nome}}

_______________________________________
CONTRATADA: {{contratada_razao_social}} — CNPJ {{contratada_cnpj}}`

// ─── Templates por tipo ─────────────────────────────────────────────────────

export const TEMPLATES: Record<ContractType, string> = {

  wedding_photo: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA DE CASAMENTO**

Pelo presente instrumento particular, de um lado **{{contratante_nome}}**, CPF {{contratante_cpf}}, residente e domiciliado em {{contratante_endereco}}, doravante denominado(a) **CONTRATANTE**;

E de outro lado, **{{contratada_razao_social}}**, inscrita no CNPJ sob o nº {{contratada_cnpj}}, doravante denominada **CONTRATADA**;

Têm entre si justo e contratado o seguinte:

**1. Objeto** — A CONTRATADA prestará serviços de fotografia para o evento de casamento do(a) CONTRATANTE, a realizar-se em **{{data_evento}}**, no local **{{local_evento}}**.

**2. Escopo da cobertura** — A cobertura compreende até **{{horas_cobertura}}** horas de cobertura contínua, incluindo making of, cerimônia e recepção, conforme alinhamento prévio.

**3. Entrega** — A CONTRATADA entregará **{{qtd_fotos}}** fotografias tratadas em alta resolução, em galeria digital online, no prazo de **{{prazo_entrega}}** dias corridos após a data do evento.

**4. Valor e forma de pagamento** — O valor total dos serviços é de **R$ {{valor_total}}** ({{valor_por_extenso}}), a ser pago da seguinte forma: **{{condicao_pagamento}}**.

**5. Cancelamento e multa** — Em caso de cancelamento pelo CONTRATANTE, a CONTRATADA reterá **{{pct_multa_cancelamento}}%** do valor total a título de reserva de agenda e custos incorridos. Para cancelamento com mais de 90 dias de antecedência, a multa fica reduzida a 25% do valor total.

**6. Direitos autorais e uso de imagem** — A CONTRATADA mantém a titularidade dos direitos autorais das fotografias, concedendo ao CONTRATANTE licença de uso pessoal, ilimitada e não exclusiva, vedada a comercialização. A CONTRATADA poderá utilizar as imagens em seu portfólio e mídias sociais, mediante consentimento prévio.

**7. Responsabilidade** — A CONTRATADA responde pela qualidade técnica dos serviços e pela entrega no prazo, ressalvados os casos fortuitos e de força maior. A CONTRATADA não se responsabiliza por cenas não captadas em razão de restrições do local, interferência de terceiros ou limitações técnicas do ambiente.

**8. ${CL_RESCISAO.replace('**Rescisão** — ', '')}**

**9. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**10. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  wedding_video: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FILMAGEM DE CASAMENTO**

Pelo presente instrumento particular, de um lado **{{contratante_nome}}**, CPF {{contratante_cpf}}, residente em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

Têm entre si justo o seguinte:

**1. Objeto** — Produção audiovisual do casamento do(a) CONTRATANTE, em **{{data_evento}}**, no local **{{local_evento}}**, incluindo captação, edição e entrega digital.

**2. Entrega** — Filme final editado com duração de **{{duracao_filme_final}}**, entregue em até **{{prazo_entrega}}** dias corridos após o evento, em formato digital de alta qualidade.

**3. Valor e pagamento** — O valor total é de **R$ {{valor_total}}** ({{valor_por_extenso}}), pago da seguinte forma: **{{condicao_pagamento}}**.

**4. Cancelamento** — Cancelamento pelo CONTRATANTE implica retenção de **{{pct_multa_cancelamento}}%** do valor total. Cancelamentos com mais de 90 dias de antecedência ficam sujeitos a multa reduzida de 25%.

**5. Direitos autorais** — A CONTRATADA mantém a titularidade dos direitos autorais da obra audiovisual e concede ao CONTRATANTE licença de uso pessoal, ilimitada, vedada a comercialização. A CONTRATADA poderá divulgar trechos em seu portfólio mediante aviso prévio.

**6. Responsabilidade** — Respondem as partes pelos compromissos aqui assumidos, ressalvados caso fortuito e força maior.

**7. ${CL_RESCISAO.replace('**Rescisão** — ', 'Rescisão** — ')}

**8. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**9. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  institutional_video: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PRODUÇÃO AUDIOVISUAL**

Pelo presente instrumento, de um lado **{{contratante_nome}}**, CNPJ {{contratante_cnpj}}, com sede em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

Têm entre si justo e contratado:

**1. Objeto** — Produção de material audiovisual institucional, conforme descrito: **{{descricao_projeto}}**.

**2. Escopo e entregáveis** — {{escopo_entregaveis}}.

**3. Cronograma** — As etapas e prazos de cada fase são: {{cronograma_etapas}}. A entrega final ocorrerá em até **{{prazo_entrega}}**.

**4. Valor e pagamento** — Valor total de **R$ {{valor_total}}** ({{valor_por_extenso}}), com pagamento conforme: **{{condicao_pagamento}}**.

**5. Direitos de uso** — A CONTRATADA cede ao CONTRATANTE os direitos de uso do material entregue para os fins especificados em: **{{direitos_uso}}**. **{{exclusividade}}**

**6. Revisões** — A CONTRATANTE terá direito a até 2 (duas) rodadas de revisão por entregável. Revisões adicionais poderão ser orçadas em separado.

**7. Responsabilidade** — A CONTRATADA responde pela qualidade técnica e prazo dos entregáveis. O CONTRATANTE fornecerá informações, locações e apoio logístico necessários para execução.

**8. Confidencialidade** — As partes comprometem-se a manter sigilo sobre informações confidenciais da outra parte obtidas durante a execução deste contrato.

**9. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**10. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  institutional_photo: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA INSTITUCIONAL**

Pelo presente, de um lado **{{contratante_nome}}**, CNPJ {{contratante_cnpj}}, com sede em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

Têm ajustado o seguinte:

**1. Objeto** — Produção de ensaio fotográfico institucional: **{{descricao_projeto}}**.

**2. Escopo** — Entrega de **{{qtd_fotos}}** fotografias tratadas, captadas em **{{local_evento}}**, no prazo de **{{prazo_entrega}}**.

**3. Valor** — Valor total de **R$ {{valor_total}}** ({{valor_por_extenso}}), pago conforme: **{{condicao_pagamento}}**.

**4. Direitos de uso** — {{direitos_uso}}. A CONTRATADA mantém a titularidade dos direitos autorais, concedendo licença de uso conforme acima.

**5. Responsabilidade** — A CONTRATADA responde pela qualidade técnica. O CONTRATANTE autoriza o uso das imagens para os fins contratados.

**6. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**7. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  fashion_photo: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA DE MODA**

Pelo presente instrumento, de um lado **{{contratante_nome}}**, {{contratante_documento}}, com endereço em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

**1. Objeto** — Produção fotográfica de moda: **{{descricao_projeto}}**, a realizar-se em **{{data_evento}}**, em **{{local_evento}}**.

**2. Escopo** — Entrega de **{{qtd_fotos}}** fotografias tratadas, em alta resolução, no prazo de **{{prazo_entrega}}**.

**3. Valor e pagamento** — **R$ {{valor_total}}** ({{valor_por_extenso}}), conforme: **{{condicao_pagamento}}**.

**4. Direitos de uso e imagem** — O CONTRATANTE recebe licença de uso para {{direitos_uso}}. {{exclusividade}} A CONTRATADA poderá utilizar as imagens em portfólio pessoal, salvo cláusula de exclusividade acordada.

**5. Modelos e terceiros** — É de responsabilidade do CONTRATANTE providenciar os termos de autorização de uso de imagem dos modelos e demais pessoas retratadas.

**6. Responsabilidade** — A CONTRATADA responde pela qualidade técnica dos serviços. Caso fortuito e força maior isentam as partes.

**7. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**8. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  book_photo: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA — ENSAIO PESSOAL**

Pelo presente, de um lado **{{contratante_nome}}**, CPF {{contratante_cpf}}, residente em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

**1. Objeto** — Ensaio fotográfico pessoal do(a) CONTRATANTE, a realizar-se em **{{data_evento}}**, em **{{local_evento}}**.

**2. Escopo** — Sessão com **{{qtd_trocas_roupa}}** trocas de roupa e entrega de **{{qtd_fotos}}** fotografias tratadas, em prazo de **{{prazo_entrega}}**.

**3. Valor** — **R$ {{valor_total}}** ({{valor_por_extenso}}), conforme: **{{condicao_pagamento}}**.

**4. Direitos de uso** — {{direitos_uso}}. A CONTRATADA mantém direitos autorais e pode utilizar para portfólio mediante consentimento.

**5. Cancelamento** — Cancelamento pelo CONTRATANTE com menos de 7 dias de antecedência implica retenção de 50% do valor.

**6. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**7. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  event_photo: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FOTOGRAFIA DE EVENTO**

Pelo presente, de um lado **{{contratante_nome}}**, {{contratante_documento}}, com endereço em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

**1. Objeto** — Cobertura fotográfica de evento em **{{data_evento}}**, em **{{local_evento}}**.

**2. Escopo** — Até **{{horas_cobertura}}** horas de cobertura e entrega de **{{qtd_fotos}}** fotografias tratadas, em prazo de **{{prazo_entrega}}**.

**3. Valor** — **R$ {{valor_total}}** ({{valor_por_extenso}}), conforme **{{condicao_pagamento}}**.

**4. Direitos de imagem** — O CONTRATANTE assume a responsabilidade pela obtenção de autorização de imagem dos participantes do evento.

**5. Direitos autorais** — A CONTRATADA mantém a titularidade autoral, concedendo ao CONTRATANTE licença de uso para divulgação do evento. A CONTRATADA pode utilizar em portfólio.

**6. Responsabilidade** — A CONTRATADA responde por qualidade técnica. Isentam-se as partes em caso fortuito e força maior.

**7. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**8. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  event_video: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FILMAGEM DE EVENTO**

Pelo presente, de um lado **{{contratante_nome}}**, {{contratante_documento}}, com endereço em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

**1. Objeto** — Cobertura audiovisual de evento em **{{data_evento}}**, em **{{local_evento}}**.

**2. Escopo** — Até **{{horas_cobertura}}** horas de cobertura, com entrega de vídeo final editado de **{{duracao_filme_final}}**, no prazo de **{{prazo_entrega}}**.

**3. Valor** — **R$ {{valor_total}}** ({{valor_por_extenso}}), conforme **{{condicao_pagamento}}**.

**4. Direitos de imagem** — O CONTRATANTE responsabiliza-se pela obtenção de autorização de imagem dos participantes.

**5. Direitos autorais** — A CONTRATADA mantém titularidade autoral da obra, concedendo licença de uso para os fins contratados. Uso em portfólio permitido.

**6. Responsabilidade** — Qualidade técnica garantida pela CONTRATADA. Caso fortuito e força maior isentam as partes.

**7. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**8. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  freelance_b2b: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PARCERIA B2B**

Pelo presente instrumento, de um lado **{{contratante_nome}}**, CNPJ {{contratante_cnpj}}, com sede em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, com sede em {{contratada_endereco}}, doravante **CONTRATADA**;

Têm ajustado entre si o seguinte:

**1. Objeto** — Prestação de serviços especializados pela CONTRATADA em favor da CONTRATANTE, conforme: **{{descricao_projeto}}**.

**2. Escopo e entregáveis** — {{escopo_entregaveis}}.

**3. Prazo de execução** — Início em **{{data_inicio}}**, término previsto em **{{data_fim}}**. Entrega final em até **{{prazo_entrega}}**.

**4. Valor e pagamento** — **R$ {{valor_total}}** ({{valor_por_extenso}}), pago conforme: **{{condicao_pagamento}}**.

**5. Direitos de uso** — {{direitos_uso}}. Cessão total, parcial ou licença não exclusiva conforme acima descrito.

**6. Confidencialidade** — {{confidencialidade}} As partes comprometem-se a manter sigilo absoluto sobre informações técnicas, comerciais e estratégicas da outra parte.

**7. Responsabilidade e autonomia** — A CONTRATADA atua de forma autônoma e sem vínculo empregatício, respondendo por encargos tributários e trabalhistas próprios.

**8. Rescisão** — Qualquer das partes pode rescindir mediante aviso prévio de {{dias_aviso_previo}} dias, sem prejuízo do pagamento proporcional ao trabalho executado.

**9. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**10. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,

  recurring_services: `**CONTRATO DE PRESTAÇÃO DE SERVIÇOS RECORRENTES**

Pelo presente instrumento, de um lado **{{contratante_nome}}**, {{contratante_documento}}, com endereço em {{contratante_endereco}}, doravante **CONTRATANTE**;

E de outro, **{{contratada_razao_social}}**, CNPJ {{contratada_cnpj}}, doravante **CONTRATADA**;

**1. Objeto** — Prestação de serviços continuados pela CONTRATADA em favor do CONTRATANTE, conforme escopo: {{escopo_entregaveis}}.

**2. Frequência** — Entregas com periodicidade **{{frequencia}}**, iniciadas em **{{data_inicio}}**, com duração prevista de **{{duracao_contrato}}**.

**3. Valor e pagamento** — Valor mensal de **R$ {{valor_mensal}}** ({{valor_por_extenso}}), com vencimento no dia **{{dia_pagamento}}** de cada mês, via transferência/Pix.

**4. Reajuste** — {{reajuste}}

**5. Rescisão** — Qualquer das partes poderá rescindir mediante aviso prévio de **{{dias_aviso_previo_rescisao}}** dias, sem multa, respeitando o pagamento proporcional dos serviços já prestados.

**6. Responsabilidade** — A CONTRATADA responde pela qualidade técnica e pela execução dentro do escopo acordado. Ajustes de escopo que impliquem em aumento de trabalho poderão ser reorçados.

**7. Confidencialidade** — As partes guardarão sigilo sobre informações da outra parte obtidas em razão da execução deste contrato.

**8. ${CL_LGPD.replace('**Proteção de Dados (LGPD)** — ', 'Proteção de Dados (LGPD)** — ')}

**9. ${CL_FORO.replace('**Foro** — ', 'Foro** — ')}

${CL_ASSINATURAS}`,
}
