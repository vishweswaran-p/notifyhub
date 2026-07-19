create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  idempotency_key text,
  channel text not null,
  recipient text not null,
  subject text,
  body text not null,
  variables jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null,
  scheduled_at timestamptz,
  accepted_at timestamptz not null default now(),
  queued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_channel_check check (channel in ('email', 'sms', 'push', 'webhook')),
  constraint notifications_status_check check (status in ('queued', 'scheduled', 'processing', 'delivered', 'failed', 'dead_lettered')),
  constraint notifications_idempotency_key_length_check check (
    idempotency_key is null or length(idempotency_key) between 8 and 128
  )
);

create unique index notifications_tenant_idempotency_key_idx
  on notifications(tenant_id, idempotency_key)
  where idempotency_key is not null;

create index notifications_tenant_created_at_idx on notifications(tenant_id, created_at desc);
create index notifications_status_scheduled_at_idx on notifications(status, scheduled_at);
