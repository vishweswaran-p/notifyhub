import type { Pool } from 'pg';

import type { DeliveryAttempt } from '../../domain/delivery-attempt.js';
import type { Notification } from '../../domain/notification.js';
import type {
  CreateNotificationInput,
  NotificationRepository,
  RecordDeliveryAttemptInput,
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

type DeliveryAttemptRow = {
  id: string;
  notification_id: string;
  tenant_id: string;
  channel: DeliveryAttempt['channel'];
  provider: string;
  status: DeliveryAttempt['status'];
  attempt_number: number;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  response_metadata: Record<string, unknown>;
  started_at: Date;
  completed_at: Date | null;
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

  public async findByIdForTenant(id: string, tenantId: string): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `
        select ${notificationColumns}
        from notifications
        where id = $1 and tenant_id = $2
      `,
      [id, tenantId],
    );

    const row = result.rows[0];
    return row ? mapNotificationRow(row) : null;
  }

  public async findByTenantAndIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `
        select ${notificationColumns}
        from notifications
        where tenant_id = $1 and idempotency_key = $2
      `,
      [tenantId, idempotencyKey],
    );

    const row = result.rows[0];
    return row ? mapNotificationRow(row) : null;
  }

  public async markProcessing(id: string, tenantId: string): Promise<Notification | null> {
    return this.updateStatus({
      id,
      tenantId,
      status: 'processing',
      allowedStatuses: ['queued', 'scheduled', 'failed'],
    });
  }

  public async markDelivered(id: string, tenantId: string): Promise<Notification | null> {
    return this.updateStatus({
      id,
      tenantId,
      status: 'delivered',
      allowedStatuses: ['processing'],
    });
  }

  public async markFailed(id: string, tenantId: string): Promise<Notification | null> {
    return this.updateStatus({
      id,
      tenantId,
      status: 'failed',
      allowedStatuses: ['processing'],
    });
  }

  public async nextAttemptNumber(notificationId: string): Promise<number> {
    const result = await this.pool.query<{ next_attempt_number: number }>(
      `
        select coalesce(max(attempt_number), 0) + 1 as next_attempt_number
        from delivery_attempts
        where notification_id = $1
      `,
      [notificationId],
    );

    return requireSingleRow(result.rows).next_attempt_number;
  }

  public async recordDeliveryAttempt(input: RecordDeliveryAttemptInput): Promise<DeliveryAttempt> {
    const result = await this.pool.query<DeliveryAttemptRow>(
      `
        insert into delivery_attempts (
          notification_id,
          tenant_id,
          channel,
          provider,
          status,
          attempt_number,
          provider_message_id,
          error_code,
          error_message,
          response_metadata,
          started_at,
          completed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning
          id,
          notification_id,
          tenant_id,
          channel,
          provider,
          status,
          attempt_number,
          provider_message_id,
          error_code,
          error_message,
          response_metadata,
          started_at,
          completed_at
      `,
      [
        input.notificationId,
        input.tenantId,
        input.channel,
        input.provider,
        input.status,
        input.attemptNumber,
        input.providerMessageId,
        input.errorCode,
        input.errorMessage,
        input.responseMetadata,
        input.startedAt,
        input.completedAt,
      ],
    );

    return mapDeliveryAttemptRow(requireSingleRow(result.rows));
  }

  private async updateStatus(params: {
    id: string;
    tenantId: string;
    status: Notification['status'];
    allowedStatuses: Notification['status'][];
  }): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `
        update notifications
        set status = $3, updated_at = now()
        where id = $1 and tenant_id = $2 and status = any($4::text[])
        returning ${notificationColumns}
      `,
      [params.id, params.tenantId, params.status, params.allowedStatuses],
    );

    const row = result.rows[0];
    return row ? mapNotificationRow(row) : null;
  }
}

const notificationColumns = `
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
`;

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

function mapDeliveryAttemptRow(row: DeliveryAttemptRow): DeliveryAttempt {
  return {
    id: row.id,
    notificationId: row.notification_id,
    tenantId: row.tenant_id,
    channel: row.channel,
    provider: row.provider,
    status: row.status,
    attemptNumber: row.attempt_number,
    providerMessageId: row.provider_message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    responseMetadata: row.response_metadata,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
