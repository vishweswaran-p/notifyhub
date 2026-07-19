create table delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null,
  provider text not null,
  status text not null,
  attempt_number integer not null,
  provider_message_id text,
  error_code text,
  error_message text,
  response_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint delivery_attempts_channel_check check (channel in ('email', 'sms', 'push', 'webhook')),
  constraint delivery_attempts_status_check check (status in ('processing', 'delivered', 'failed')),
  constraint delivery_attempts_attempt_number_check check (attempt_number > 0)
);

create index delivery_attempts_notification_started_at_idx
  on delivery_attempts(notification_id, started_at desc);

create index delivery_attempts_tenant_started_at_idx
  on delivery_attempts(tenant_id, started_at desc);
