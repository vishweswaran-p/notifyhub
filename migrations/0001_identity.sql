create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  rate_limit_per_minute integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_status_check check (status in ('active', 'suspended')),
  constraint tenants_rate_limit_check check (rate_limit_per_minute > 0)
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  status text not null default 'active',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint api_keys_status_check check (status in ('active', 'revoked'))
);

create index api_keys_tenant_id_idx on api_keys(tenant_id);
create index api_keys_key_prefix_idx on api_keys(key_prefix);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  actor_type text not null,
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_type_check check (actor_type in ('system', 'api_key', 'jwt', 'admin'))
);

create index audit_logs_tenant_created_at_idx on audit_logs(tenant_id, created_at desc);
create index audit_logs_action_idx on audit_logs(action);
