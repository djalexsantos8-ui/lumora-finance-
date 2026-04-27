-- HOTFIX Phase 6: policy recursivo em workspace_members causa
-- "infinite recursion detected in policy" porque o OR depende de workspaces.SELECT
-- que por sua vez depende de workspace_members.SELECT.
-- Substituímos pela função user_workspaces() SECURITY DEFINER que bypassa RLS.

drop policy if exists "workspace_members: self can read" on public.workspace_members;
drop policy if exists "workspace_members: members can select" on public.workspace_members;

create policy "workspace_members: read own and same workspace"
  on public.workspace_members for select
  using (
    user_id = auth.uid()
    or workspace_id in (select public.user_workspaces())
  );

comment on policy "workspace_members: read own and same workspace" on public.workspace_members is
  'Phase 6 hotfix: usa user_workspaces() SECURITY DEFINER pra evitar recursão com workspaces.SELECT.';
