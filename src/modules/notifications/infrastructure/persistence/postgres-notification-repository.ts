import type { Pool } from 'pg';

import type { Notification } from '../../domain/notification.js';
import type {
  CreateNotificationInput,
  NotificationRepository,
} from '../../application/notification-repository.js';

type NotificationRow = {
  id: string;
  tenant_id: string;
  idempotency_key: string | null;
  channel: Notification['channel'];
  recipient: string;
  subject: string | null;
  body: string;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: Notification['status'];
  scheduled_at: Date | null;
  accepted_at: Date;
  queued_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export class PostgresNotificationRepository implements NotificationRepository {
  public constructor(private readonly pool: Pool) {}

  public async create(input: CreateNotificationInput): Promise<Notification> {
    const result = await this.pool.query<NotificationRow>(
      `
        insert into notifications (
          tenant_id,
          idempotency_key,
          channel,
          recipient,
          subject,
          body,
          variables,
          metadata,
          status,
          scheduled_at,
          queued_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning
          id,
          tenant_id,
          idempotency_key,
          channel,
          recipient,
          subject,
          body,
          variables,
          metadata,
          status,
          scheduled_at,
          accepted_at,
          queued_at,
          created_at,
          updated_at
      `,
      [
        input.tenantId,
        input.idempotencyKey,
        input.channel,
        input.recipient,
        input.subject,
        input.body,
        input.variables,
        input.metadata,
        input.status,
        input.scheduledAt,
        input.queuedAt,
      ],
    );

    return mapNotificationRow(requireSingleRow(result.rows));
  }

  public async findByTenantAndIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `
        select
          id,
          tenant_id,
          idempotency_key,
          channel,
          recipient,
          subject,
          body,
          variables,
          metadata,
          status,
          scheduled_at,
          accepted_at,
          queued_at,
          created_at,
          updated_at
        from notifications
        where tenant_id = $1 and idempotency_key = $2
      `,
      [tenantId, idempotencyKey],
    );

    const row = result.rows[0];
    return row ? mapNotificationRow(row) : null;
  }
}

function requireSingleRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected database operation to return one row.');
  }

  return row;
}

function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    idempotencyKey: row.idempotency_key,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    variables: row.variables,
    metadata: row.metadata,
    status: row.status,
    scheduledAt: row.scheduled_at,
    acceptedAt: row.accepted_at,
    queuedAt: row.queued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
