-- ─── Insights CMS ────────────────────────────────────────────────────────────
--
-- Tabela global (não por workspace) de posts educacionais que aparecem em
-- /insights. Qualquer usuário logado pode LER posts publicados; só admins
-- (admin_grants ativos) podem criar/editar/publicar/despublicar.
--
-- Escolhas:
--   · body é markdown (text). Render em /insights/[slug] via renderer
--     server-side simples (não precisa bundle do tiptap no cliente).
--   · cover_image_url é string (upload externo — Supabase Storage ou URL).
--   · status controla visibilidade: draft é invisível pra não-admins.
--   · slug único (mesmo entre drafts) — evita conflito de URL.
--   · categoria é string livre (ex: "Precificação", "Operação") pra
--     manter a UI de filtros atual.

create table if not exists public.insights_posts (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  category       text not null default 'Geral',
  excerpt        text,
  body_markdown  text not null default '',
  cover_image_url text,
  status         text not null default 'draft' check (status in ('draft','published','archived')),
  published_at   timestamptz,
  author_email   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists insights_posts_status_published_at_idx
  on public.insights_posts (status, published_at desc nulls last);

create index if not exists insights_posts_category_idx
  on public.insights_posts (category);

-- Trigger de updated_at
create or replace function public.insights_posts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists insights_posts_touch_updated_at on public.insights_posts;
create trigger insights_posts_touch_updated_at
  before update on public.insights_posts
  for each row execute function public.insights_posts_touch_updated_at();

-- RLS
alter table public.insights_posts enable row level security;

-- SELECT: qualquer autenticado lê posts publicados; admins leem tudo.
drop policy if exists insights_posts_select_public on public.insights_posts;
create policy insights_posts_select_public
  on public.insights_posts for select
  using (
    status = 'published'
    or exists (
      select 1 from public.admin_grants g
      where g.user_id = auth.uid()
        and (g.expires_at is null or g.expires_at > now())
    )
  );

-- INSERT/UPDATE/DELETE: apenas admins ativos.
drop policy if exists insights_posts_admin_write on public.insights_posts;
create policy insights_posts_admin_write
  on public.insights_posts for all
  using (
    exists (
      select 1 from public.admin_grants g
      where g.user_id = auth.uid()
        and (g.expires_at is null or g.expires_at > now())
    )
  )
  with check (
    exists (
      select 1 from public.admin_grants g
      where g.user_id = auth.uid()
        and (g.expires_at is null or g.expires_at > now())
    )
  );
