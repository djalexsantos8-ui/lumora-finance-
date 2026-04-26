-- EPIC-22: Tipos de projeto pré-cadastrados (17 do audiovisual brasileiro)
create table if not exists public.project_types (
  code text primary key,
  label text not null,
  description text not null,
  icon text not null,
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

insert into public.project_types (code, label, description, icon, sort_order) values
  ('comercial',     'Comercial / Publicidade',  'TVC, conteúdo de marca, vídeos pra agências',                        '📺', 10),
  ('casamento',     'Casamento',                'Same-day-edit, vídeo completo, trailer, making of',                  '💒', 20),
  ('aniversario',   'Aniversário / Festas',     '15 anos, bodas, eventos pessoais',                                   '🎉', 30),
  ('corporativo',   'Corporativo',              'Institucional, treinamento, comunicação interna',                    '🏢', 40),
  ('evento',        'Cobertura de Evento',      'Lançamento, palestras, congressos',                                  '🎤', 50),
  ('documentario',  'Documentário',             'Curta, médio, longa documental',                                     '🎬', 60),
  ('clipe_musical', 'Clipe Musical',            'Vídeo pra música, performance, lyric video',                         '🎵', 70),
  ('entrevista',    'Entrevista / Depoimento',  'Talking head, stories de cliente',                                   '🎙️', 80),
  ('webserie',      'Websérie / YouTube',       'Episódios, conteúdo recorrente pra plataformas',                     '📹', 90),
  ('reels_social',  'Reels / Conteúdo Social',  'Vertical 9:16, TikTok, Instagram',                                   '📱', 100),
  ('educacional',   'Curso / EaD',              'Aulas online, módulos, screen recording',                            '🎓', 110),
  ('imobiliario',   'Imóveis / Tour Virtual',   'Drone, walkthrough, fotos pra venda',                                '🏠', 120),
  ('gastronomia',   'Gastronomia',              'Receita, food tabletop, divulgação restaurante',                     '🍽️', 130),
  ('moda',          'Editorial de Moda',        'Lookbook, campanha, fashion film',                                   '👗', 140),
  ('esporte',       'Esportivo',                'Performance, treino, competição',                                    '⚽', 150),
  ('religioso',     'Religioso',                'Cerimônia, eventos da igreja, retiros',                              '⛪', 160),
  ('outro',         'Outro',                    'Catch-all — descreva no campo livre',                                '🔧', 999)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

create index if not exists idx_project_types_active_sort
  on public.project_types(active, sort_order);

alter table public.project_types enable row level security;

drop policy if exists "auth read project_types" on public.project_types;
create policy "auth read project_types" on public.project_types
  for select to authenticated using (true);

alter table public.budgets_v2
  add column if not exists project_type_other text,
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_budgets_v2_type
  on public.budgets_v2(workspace_id, project_type);

create index if not exists idx_budgets_v2_tags
  on public.budgets_v2 using gin(tags);

comment on table public.project_types is
  'EPIC-22: 17 tipos curated do audiovisual brasileiro. Sistema-wide, read-only via API.';
