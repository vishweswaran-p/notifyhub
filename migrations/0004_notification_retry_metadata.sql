alter table notifications
  add column dead_lettered_at timestamptz,
  add column last_error_code text,
  add column last_error_message text;

create index notifications_dead_lettered_at_idx
  on notifications(dead_lettered_at desc)
  where dead_lettered_at is not null;
