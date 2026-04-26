-- EPIC-38: Convidar usuário por email (tokens + aceite)
create table if not exists public.workspace_invites_v2 (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member'
    check (role in ('admin', 'editor', 'viewer', 'member')),
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  message text,
  unique (workspace_id, email)
);

create unique index if not exists idx_invites_token on public.workspace_invites_v2(token);
create index if not exists idx_invites_email on public.workspace_invites_v2(email);
create index if not exists idx_invites_workspace_pending on public.workspace_invites_v2(workspace_id)
  where accepted_at is null and revoked_at is null;

alter table public.workspace_invites_v2 enable row level security;

create policy "members can read invites_v2" on public.workspace_invites_v2
  for select using (workspace_id in (select public.user_workspaces()));

create policy "owners can insert invites_v2" on public.workspace_invites_v2
  for insert with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.role = 'owner' and wm.status = 'active'
    )
  );

create policy "owners can update invites_v2" on public.workspace_invites_v2
  for update using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.role = 'owner' and wm.status = 'active'
    )
  ) with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.role = 'owner' and wm.status = 'active'
    )
  );

create or replace function public.workspace_seats_used(p_workspace_id uuid)
returns int language sql stable security definer as $$
  select
    (select count(*)::int from public.workspace_members
       where workspace_id = p_workspace_id and status = 'active') +
    (select count(*)::int from public.workspace_invites_v2
       where workspace_id = p_workspace_id
         and accepted_at is null
         and revoked_at is null
         and expires_at > now())
$$;

create or replace function public.workspace_seats_limit(p_workspace_id uuid)
returns int language sql stable security definer as $$
  select coalesce(max_users, 1) from public.workspaces where id = p_workspace_id
$$;

create or replace function public.get_invite_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'id',               i.id,
    'email',            i.email,
    'role',             i.role,
    'workspace_id',     i.workspace_id,
    'workspace_name',   w.name,
    'invited_by_email', u.email,
    'message',          i.message,
    'expires_at',       i.expires_at,
    'accepted_at',      i.accepted_at,
    'revoked_at',       i.revoked_at
  ) into v_result
  from public.workspace_invites_v2 i
  join public.workspaces w on w.id = i.workspace_id
  left join auth.users u on u.id = i.invited_by
  where i.token = p_token;
  return v_result;
end $$;

grant execute on function public.get_invite_by_token(uuid) to anon, authenticated;

create or replace function public.accept_invite(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_invite record;
  v_user_email text;
  v_member_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_invite from public.workspace_invites_v2 where token = p_token;
  if v_invite is null then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  if v_invite.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted', 'workspace_id', v_invite.workspace_id);
  end if;
  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if lower(v_user_email) <> lower(v_invite.email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch',
      'expected', v_invite.email, 'got', v_user_email);
  end if;

  if public.workspace_seats_used(v_invite.workspace_id) >= public.workspace_seats_limit(v_invite.workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'seat_limit_reached');
  end if;

  update public.workspace_members
  set user_id = auth.uid(),
      status  = 'active',
      joined_at = now()
  where workspace_id = v_invite.workspace_id
    and lower(email) = lower(v_invite.email)
  returning id into v_member_id;

  if v_member_id is null then
    insert into public.workspace_members (
      workspace_id, user_id, email, role, status, invited_by, invited_at, joined_at
    ) values (
      v_invite.workspace_id,
      auth.uid(),
      v_invite.email,
      'member',
      'active',
      v_invite.invited_by,
      v_invite.invited_at,
      now()
    )
    returning id into v_member_id;
  end if;

  update public.workspace_invites_v2
  set accepted_at = now(), accepted_by = auth.uid()
  where token = p_token;

  return jsonb_build_object('ok', true, 'workspace_id', v_invite.workspace_id, 'member_id', v_member_id);
end $$;

grant execute on function public.accept_invite(uuid) to authenticated;

comment on table public.workspace_invites_v2 is
  'EPIC-38: Convites por email com token. Workspace owner gera, convidado clica link e aceita via RPC accept_invite.';
