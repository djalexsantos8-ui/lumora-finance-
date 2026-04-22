-- =============================================================================
-- Lumora Finance — Feedback v2: attachment opcional + prompt Cloud Code
-- =============================================================================
-- Criado em 2026-04-23.
--
-- Adiciona ao sistema de feedback:
--   1. Colunas de attachment opcional (print/imagem/PDF leve)
--   2. Campo text `prompt_cloud_code` para prompt gerado pela IA, acionável.
--   3. Bucket privado `feedback-attachments` com policies por user_id (igual ao
--      bucket de áudio).
--
-- NÃO altera schema existente do feedback. NÃO mexe em RLS já criada.
-- Idempotente.
-- =============================================================================

-- ── Colunas novas na tabela feedback ─────────────────────────────────────────

alter table public.feedback
  add column if not exists attachment_path       text,
  add column if not exists attachment_filename   text,
  add column if not exists attachment_mime       text,
  add column if not exists attachment_size_bytes bigint,
  add column if not exists prompt_cloud_code     text;

-- Index pra filtrar "com anexo" na inbox admin
create index if not exists idx_feedback_has_attachment
  on public.feedback ((attachment_path is not null))
  where deleted_at is null;

-- ── Bucket de attachments ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('feedback-attachments', 'feedback-attachments', false)
on conflict (id) do nothing;

-- Policies (mirror da feedback-audio: user-scoped por pasta + admin all)
drop policy if exists feedback_attach_user_insert on storage.objects;
drop policy if exists feedback_attach_user_select on storage.objects;
drop policy if exists feedback_attach_admin_all   on storage.objects;

create policy feedback_attach_user_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy feedback_attach_user_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy feedback_attach_admin_all on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and public.is_current_user_admin()
  )
  with check (
    bucket_id = 'feedback-attachments'
    and public.is_current_user_admin()
  );

-- =============================================================================
-- Fim
-- =============================================================================
