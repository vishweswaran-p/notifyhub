create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  channel text not null,
  subject_template text,
  body_template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_channel_check check (channel in ('email', 'sms', 'push', 'webhook')),
  constraint notification_templates_name_length_check check (length(name) between 1 and 120)
);

create unique index notification_templates_tenant_name_idx
  on notification_templates(tenant_id, lower(name));

create index notification_templates_tenant_created_at_idx
  on notification_templates(tenant_id, created_at desc);

alter table notifications
  add column template_id uuid references notification_templates(id) on delete set null;

create index notifications_template_id_idx on notifications(template_id);
