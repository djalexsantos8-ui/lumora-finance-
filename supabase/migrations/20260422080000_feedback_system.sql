-- =============================================================================
-- Lumora Finance — Sistema de feedback de beta testers
-- =============================================================================
-- Criado em 2026-04-22.
--
-- Modelo:
--  - Usuários autenticados enviam feedback (texto ou áudio).
--  - Admins (via admin_grants) leem/gerenciam tudo.
--  - Áudio vai para bucket `feedback-audio` (privado, por user_id).
--  - Transcription + analysis rodam async e populam colunas.
--
-- Idempotente: usa IF NOT EXISTS e CREATE OR REPLACE onde possível.
-- =============================================================================

-- ── ENUMS ─────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feedback_job_status') then
    create type feedback_job_status as enum ('pending', 'completed', 'failed', 'skipped');
  end if;

  if not exists (select 1 from pg_type where typname = 'feedback_status') then
    create type feedback_status as enum (
      'novo', 'triagem', 'planejado', 'em_andamento', 'resolvido', 'descartado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'feedback_source') then
    create type feedback_source as enum ('user', 'admin_manual');
  end if;
end$$;

-- ── TABELA ────────────────────────────────────────────────────────────────────

create table if not exists public.feedback (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid references public.workspaces(id) on delete set null,
  user_id               uuid references auth.users(id) on delete set null,
  email                 text,

  source                feedback_source not null default 'user',
  source_page           text,
  user_agent            text,
  app_version           text,

  user_type             text,          -- tipo declarado pelo usuário (opcional)

  raw_text              text,
  audio_path            text,
  audio_mime            text,
  audio_duration_sec    numeric,

  transcript            text,
  transcription_status  feedback_job_status not null default 'pending',
  transcription_error   text,

  analysis              jsonb,
  analysis_status       feedback_job_status not null default 'pending',
  analysis_error        text,

  -- Campos derivados p/ filtros rápidos
  ai_type               text,
  severity              text,
  priority_score        int,
  summary               text,
  tags                  text[],

  status                feedback_status not null default 'novo',
  admin_notes           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  created_by_admin      boolean not null default false
);

-- Constraint: todo feedback precisa ter texto OU áudio (não pode ser vazio)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'feedback_has_content'
  ) then
    alter table public.feedback add constraint feedback_has_content
      check (
        (raw_text is not null and length(trim(raw_text)) > 0)
        or audio_path is not null
      );
  end if;
end$$;

-- Índices p/ queries de admin (filtros + ordenação)
create index if not exists idx_feedback_created_at    on public.feedback (created_at desc) where deleted_at is null;
create index if not exists idx_feedback_status        on public.feedback (status)           where deleted_at is null;
create index if not exists idx_feedback_severity      on public.feedback (severity)         where deleted_at is null;
create index if not exists idx_feedback_priority      on public.feedback (priority_score desc nulls last) where deleted_at is null;
create index if not exists idx_feedback_user_id       on public.feedback (user_id)          where deleted_at is null;
create index if not exists idx_feedback_analysis_st   on public.feedback (analysis_status)  where deleted_at is null;

-- Trigger de updated_at
create or replace function public.feedback_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end$$ language plpgsql;

drop trigger if exists trg_feedback_updated_at on public.feedback;
create trigger trg_feedback_updated_at
  before update on public.feedback
  for each row execute function public.feedback_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.feedback enable row level security;

-- Helper: é admin ativo?
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_grants g
    where g.user_id = auth.uid()
      and (g.expires_at is null or g.expires_at > now())
  );
$$;

grant execute on function public.is_current_user_admin() to authenticated;

-- Policies
drop policy if exists feedback_user_insert       on public.feedback;
drop policy if exists feedback_user_select_own   on public.feedback;
drop policy if exists feedback_admin_all         on public.feedback;

-- User: pode inserir o próprio feedback (user_id = auth.uid())
create policy feedback_user_insert on public.feedback
  for insert
  to authenticated
  with check (
    source = 'user'
    and user_id = auth.uid()
  );

-- User: pode ver apenas o próprio feedback (não edita, não deleta)
create policy feedback_user_select_own on public.feedback
  for select
  to authenticated
  using (user_id = auth.uid() and deleted_at is null);

-- Admin: acesso total (select/insert/update/delete)
create policy feedback_admin_all on public.feedback
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- ── STORAGE BUCKET ────────────────────────────────────────────────────────────
-- Bucket privado para áudios. Path: {user_id}/{timestamp}-{random}.webm
insert into storage.buckets (id, name, public)
values ('feedback-audio', 'feedback-audio', false)
on conflict (id) do nothing;

-- Policies do bucket
drop policy if exists feedback_audio_user_insert   on storage.objects;
drop policy if exists feedback_audio_user_select   on storage.objects;
drop policy if exists feedback_audio_admin_all     on storage.objects;

-- User: pode inserir arquivo APENAS na sua pasta
create policy feedback_audio_user_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'feedback-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- User: pode ler só da sua pasta
create policy feedback_audio_user_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'feedback-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin: acesso total no bucket
create policy feedback_audio_admin_all on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'feedback-audio'
    and public.is_current_user_admin()
  )
  with check (
    bucket_id = 'feedback-audio'
    and public.is_current_user_admin()
  );

-- =============================================================================
-- Fim
-- =============================================================================
