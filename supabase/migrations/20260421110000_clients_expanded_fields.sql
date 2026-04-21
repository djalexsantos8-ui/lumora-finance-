-- ============================================================
-- MIGRATION — Clients expanded fields (pente fino 2026-04-21)
--
-- Expande `clients` para suportar contratos B2B, emissão de PDF de
-- contratos e enriquecimento comercial. TODOS os campos novos são
-- NULLABLE — zero impacto nos clientes existentes.
--
-- Novos campos:
--   · person_type           'pf' | 'pj' (opcional — só preenche quando relevante)
--   · legal_name            (razão social — PJ)
--   · trade_name            (nome fantasia — PJ)
--   · document_cpf          (CPF — PF, separado do genérico "document")
--   · document_cnpj         (CNPJ — PJ)
--   · address_line          (rua + número + complemento em uma linha)
--   · address_city
--   · address_state         (UF)
--   · address_zip           (CEP)
--   · segment               (nicho: casamento / institucional / moda / etc.)
--   · lead_source           (origem: indicação / instagram / google / etc.)
--   · payment_condition     (observação padrão de pagamento)
--   · responsible_name      (contato responsável na empresa)
--   · responsible_role      (cargo do contato)
--
-- `document` (texto genérico) segue existindo — é o fallback para quem
-- digitou documento antes sem saber se era PF/PJ. Front pode continuar
-- usando ou migrar gradualmente pros campos específicos.
-- ============================================================

alter table public.clients
  add column if not exists person_type        text check (person_type in ('pf', 'pj')),
  add column if not exists legal_name         text,
  add column if not exists trade_name         text,
  add column if not exists document_cpf       text,
  add column if not exists document_cnpj      text,
  add column if not exists address_line       text,
  add column if not exists address_city       text,
  add column if not exists address_state      text,
  add column if not exists address_zip        text,
  add column if not exists segment            text,
  add column if not exists lead_source        text,
  add column if not exists payment_condition  text,
  add column if not exists responsible_name   text,
  add column if not exists responsible_role   text;

-- Índice para segmentação/filtros de inteligência comercial.
create index if not exists idx_clients_segment
  on public.clients(workspace_id, segment)
  where deleted_at is null and segment is not null;

create index if not exists idx_clients_lead_source
  on public.clients(workspace_id, lead_source)
  where deleted_at is null and lead_source is not null;
