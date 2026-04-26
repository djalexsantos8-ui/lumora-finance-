-- EPIC-16: PDF "Encargos do projeto"
-- Adiciona flag is_encargo (item soma como encargo agregado) e
-- description_visible (texto que aparece no PDF cliente — fallback pro description).
alter table public.budget_items_v2
  add column if not exists is_encargo boolean not null default false,
  add column if not exists description_visible text;

create index if not exists idx_budget_items_v2_encargo
  on public.budget_items_v2 (budget_id, is_encargo);

comment on column public.budget_items_v2.is_encargo is
  'EPIC-16: quando true, o item NAO aparece individualmente no PDF cliente — soma agregado em "Encargos do projeto".';
comment on column public.budget_items_v2.description_visible is
  'EPIC-16: texto que aparece no PDF cliente (fallback: description). Permite mascarar nomes técnicos (ex: "Sony FX6" -> "Captação 4K profissional").';
