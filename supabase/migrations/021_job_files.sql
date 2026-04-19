-- ============================================================
-- MIGRATION 021 — Job Files
--
-- Arquivos vinculados a um job (contratos, comprovantes, entregáveis).
--
-- Arquitetura:
--   · Binário: Supabase Storage bucket `job-files` (privado)
--   · Metadata: tabela `job_files` (source of truth pra listagem)
--   · Upload direto client → storage (contorna body-limit do Next serverless)
--   · URLs via createSignedUrl (1h TTL) — nunca públicas
--
-- Path no storage: {workspace_id}/{job_id}/{timestamp}-{random}-{safe_name}
-- O workspace_id como prefixo é o que a storage policy checa.
--
-- Delete: soft delete (deleted_at). O binário só é removido do bucket via
-- server action (que faz as duas coisas atomicamente do ponto de vista do UX).
-- ============================================================

-- ─── 1. Tabela job_files ────────────────────────────────────────

create table if not exists public.job_files (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  job_id         uuid        not null references public.jobs(id)       on delete cascade,
  uploaded_by    uuid        not null references auth.users(id),

  -- Path completo dentro do bucket, ex: "wsid/jobid/1713552000000-abc-contrato.pdf"
  -- UNIQUE porque o timestamp-random garante unicidade na geração.
  storage_path   text        not null unique,

  -- Nome legível (display). Pode ter acentos, espaços etc.
  file_name      text        not null,

  -- MIME type do arquivo FINAL (após conversão). Ex: image/jpeg, application/pdf.
  mime_type      text        not null,

  -- Tamanho em bytes (do arquivo FINAL enviado ao storage).
  size_bytes     bigint      not null check (size_bytes > 0),

  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint job_files_name_not_empty check (length(trim(file_name)) > 0),
  constraint job_files_mime_whitelist check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ))
);

-- Listagem por job (view do detalhe do freelance)
create index if not exists idx_job_files_job_active
  on public.job_files(job_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_job_files_workspace
  on public.job_files(workspace_id);

-- ─── 2. RLS ─────────────────────────────────────────────────────

alter table public.job_files enable row level security;

drop policy if exists "job_files: workspace members full access" on public.job_files;
create policy "job_files: workspace members full access"
  on public.job_files for all
  using (
    exists (
      select 1
      from   public.workspace_members wm
      where  wm.workspace_id = job_files.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1
      from   public.workspace_members wm
      where  wm.workspace_id = job_files.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 3. Storage bucket ──────────────────────────────────────────
--
-- Cria o bucket como privado. Idempotente.

insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

-- ─── 4. Storage policies ────────────────────────────────────────
--
-- Isolamento por workspace usando o PRIMEIRO segmento do path do objeto.
-- Ex: path = "8f3a.../abc.../1713-xyz-contrato.pdf" → prefixo = "8f3a..."
--
-- split_part(name, '/', 1)::uuid dá o workspace_id embutido no path.
-- A policy checa se esse uuid é um workspace do usuário autenticado.

drop policy if exists "job-files: workspace read"   on storage.objects;
drop policy if exists "job-files: workspace insert" on storage.objects;
drop policy if exists "job-files: workspace update" on storage.objects;
drop policy if exists "job-files: workspace delete" on storage.objects;

create policy "job-files: workspace read"
  on storage.objects for select
  using (
    bucket_id = 'job-files'
    and auth.uid() is not null
    and exists (
      select 1
      from   public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

create policy "job-files: workspace insert"
  on storage.objects for insert
  with check (
    bucket_id = 'job-files'
    and auth.uid() is not null
    and exists (
      select 1
      from   public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

create policy "job-files: workspace update"
  on storage.objects for update
  using (
    bucket_id = 'job-files'
    and auth.uid() is not null
    and exists (
      select 1
      from   public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

create policy "job-files: workspace delete"
  on storage.objects for delete
  using (
    bucket_id = 'job-files'
    and auth.uid() is not null
    and exists (
      select 1
      from   public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );
