-- ============================================
-- Migration 003: Growth System
-- Lumora Finance
-- admin_grants · coupon_codes · coupon_usages · affiliates
-- ============================================

-- ============================================
-- ENUMS
-- ============================================
do $$ begin
  create type admin_grant_type_enum as enum (
    'free',       -- acesso permanente (parceiro, amigo, beta tester)
    'trial',      -- trial customizado com data de expiração
    'partner'     -- acesso permanente de parceiro/influenciador
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type coupon_discount_type_enum as enum (
    'percentage', -- ex: 30% de desconto
    'fixed'       -- ex: R$ 20 de desconto
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type coupon_duration_enum as enum (
    'once',       -- desconto apenas na primeira cobrança
    'repeating',  -- desconto por N meses (duration_months)
    'forever'     -- desconto permanente na assinatura
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type affiliate_commission_type_enum as enum (
    'percentage', -- % do valor da assinatura
    'fixed'       -- valor fixo por conversão
  );
exception when duplicate_object then null; end $$;

-- ============================================
-- AFFILIATES
-- (criado antes de coupon_codes por ser referenciado)
-- ============================================
create table if not exists public.affiliates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text not null unique,
  commission_type  affiliate_commission_type_enum not null default 'percentage',
  commission_value numeric(10,2) not null default 0 check (commission_value >= 0),
  is_active        boolean not null default true,
  notes            text,
  total_referrals  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_affiliates_updated_at
  before update on public.affiliates
  for each row execute function set_updated_at();

-- ============================================
-- COUPON CODES
-- ============================================
create table if not exists public.coupon_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,           -- ex: LUMORA30, FIILM2026
  discount_type    coupon_discount_type_enum not null default 'percentage',
  discount_value   numeric(10,2) not null check (discount_value > 0),
  duration         coupon_duration_enum not null default 'once',
  duration_months  integer check (duration_months > 0), -- só para 'repeating'
  max_uses         integer check (max_uses > 0),   -- null = ilimitado
  use_count        integer not null default 0,
  expires_at       timestamptz,                    -- null = sem expiração
  is_active        boolean not null default true,
  affiliate_id     uuid references public.affiliates(id) on delete set null,
  stripe_coupon_id text,                           -- populado ao integrar Stripe
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_coupon_codes_updated_at
  before update on public.coupon_codes
  for each row execute function set_updated_at();

-- ============================================
-- COUPON USAGES
-- ============================================
create table if not exists public.coupon_usages (
  id                 uuid primary key default gen_random_uuid(),
  coupon_id          uuid not null references public.coupon_codes(id) on delete restrict,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  used_at            timestamptz not null default now(),
  stripe_discount_id text,                         -- populado ao integrar Stripe
  unique(coupon_id, user_id)                        -- um uso por usuário por cupom
);

-- ============================================
-- ADMIN GRANTS
-- Override manual de acesso — bypassa subscription check
-- Pode ser criado antes do usuário existir (via email)
-- ============================================
create table if not exists public.admin_grants (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  user_id          uuid unique references public.profiles(id) on delete set null,
  grant_type       admin_grant_type_enum not null default 'trial',
  expires_at       timestamptz,          -- null = permanente
  notes            text,                 -- nota interna (motivo do grant)
  created_by_admin text,                 -- email/nome de quem criou
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_admin_grants_updated_at
  before update on public.admin_grants
  for each row execute function set_updated_at();

-- ============================================
-- TRIGGER: vincular admin_grant ao user_id quando usuário se cadastra
-- Isso garante que grants criados por email antes do cadastro funcionem
-- ============================================
create or replace function public.link_admin_grant_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.admin_grants
  set user_id = new.id
  where email = new.email
    and user_id is null;
  return new;
end;
$$;

-- Roda após inserir em profiles (que é criado pelo handle_new_user)
drop trigger if exists on_profile_created_link_grant on public.profiles;
create trigger on_profile_created_link_grant
  after insert on public.profiles
  for each row execute procedure public.link_admin_grant_on_signup();

-- ============================================
-- RLS
-- ============================================
alter table public.affiliates      enable row level security;
alter table public.coupon_codes    enable row level security;
alter table public.coupon_usages   enable row level security;
alter table public.admin_grants    enable row level security;

-- AFFILIATES: sem acesso client-side (apenas via service_role / admin)
create policy "affiliates: no client access"
  on public.affiliates for all
  using (false);

-- COUPON CODES: leitura pública de cupons ativos (para validação no checkout)
-- Escrita apenas via service_role
create policy "coupon_codes: public read active"
  on public.coupon_codes for select
  using (is_active = true);

-- COUPON USAGES: usuário vê e cria os próprios
create policy "coupon_usages: own read"
  on public.coupon_usages for select
  using (user_id = auth.uid());

create policy "coupon_usages: own insert"
  on public.coupon_usages for insert
  with check (user_id = auth.uid());

-- ADMIN GRANTS: usuário lê apenas o próprio grant (por user_id)
-- Escrita apenas via service_role
create policy "admin_grants: own read"
  on public.admin_grants for select
  using (user_id = auth.uid());

-- ============================================
-- INDEXES
-- ============================================
create index if not exists idx_admin_grants_user_id
  on public.admin_grants(user_id)
  where user_id is not null;

create index if not exists idx_admin_grants_email
  on public.admin_grants(email);

create index if not exists idx_coupon_codes_code
  on public.coupon_codes(code)
  where is_active = true;

create index if not exists idx_coupon_codes_affiliate
  on public.coupon_codes(affiliate_id)
  where affiliate_id is not null;

create index if not exists idx_coupon_usages_coupon
  on public.coupon_usages(coupon_id);

create index if not exists idx_coupon_usages_user
  on public.coupon_usages(user_id);
