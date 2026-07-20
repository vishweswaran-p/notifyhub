import type { Pool } from 'pg';

import type { DeliveryAttempt } from '../../domain/delivery-attempt.js';
import type { Notification } from '../../domain/notification.js';
import type {
  ClaimDueScheduledInput,
  CreateNotificationInput,
  GetTenantNotificationMetricsInput,
  ListNotificationsInput,
  ListNotificationsResult,
  NotificationRepository,
  RecordDeliveryAttemptInput,
  TenantNotificationMetrics,
} from '../../application/notification-repository.js';

type NotificationRow = {
  id: string;
  tenant_id: string;
  idempotency_key: string | null;
  template_id: string | null;
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
  dead_lettered_at: Date | null;
  last_error_code: string | null;
  last_error_message: string | null;
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

type CountRow = {
  count: string;
};

type StatusCountRow = {
  status: Notification['status'];
  count: string;
};

type ChannelCountRow = {
  channel: Notification['channel'];
  count: string;
};

type DeliveryAttemptMetricsRow = {
  total: string;
  delivered: string;
  failed: string;
};

export class PostgresNotificationRepository implements NotificationRepository {
  public constructor(private readonly pool: Pool) {}

  public async create(input: CreateNotificationInput): Promise<Notification> {
    const result = await this.pool.query<NotificationRow>(
      `
        insert into notifications (
          tenant_id,
          idempotency_key,
          template_id,
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
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning
          id,
          tenant_id,
          idempotency_key,
          template_id,
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
          dead_lettered_at,
          last_error_code,
          last_error_message,
          created_at,
          updated_at
      `,
      [
        input.tenantId,
        input.idempotencyKey,
        input.templateId,
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

  public async claimDueScheduled(input: ClaimDueScheduledInput): Promise<Notification[]> {
    const result = await this.pool.query<NotificationRow>(
      `
        update notifications
        set
          status = 'queued',
          queued_at = $1,
          updated_at = now()
        where id in (
          select id
          from notifications
          where status = 'scheduled'
            and scheduled_at is not null
            and scheduled_at <= $1
          order by scheduled_at asc, created_at asc, id asc
          limit $2
          for update skip locked
        )
        returning ${notificationColumns}
      `,
      [input.now, input.limit],
    );

    return result.rows.map(mapNotificationRow);
  }

  public async listForTenant(input: ListNotificationsInput): Promise<ListNotificationsResult> {
    const filters = ['tenant_id = $1'];
    const values: unknown[] = [input.tenantId];

    if (input.status) {
      values.push(input.status);
      filters.push(`status = $${values.length}`);
    }

    if (input.channel) {
      values.push(input.channel);
      filters.push(`channel = $${values.length}`);
    }

    const whereClause = filters.join(' and ');
    const totalResult = await this.pool.query<CountRow>(
      `select count(*) as count from notifications where ${whereClause}`,
      values,
    );
    const listValues = [...values, input.limit, input.offset];
    const itemsResult = await this.pool.query<NotificationRow>(
      `
        select ${notificationColumns}
        from notifications
        where ${whereClause}
        order by created_at desc, id desc
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      listValues,
    );

    return {
      items: itemsResult.rows.map(mapNotificationRow),
      total: Number(requireSingleRow(totalResult.rows).count),
    };
  }

  public async getTenantMetrics(
    input: GetTenantNotificationMetricsInput,
  ): Promise<TenantNotificationMetrics> {
    const [totalResult, statusResult, channelResult, deliveryAttemptsResult] = await Promise.all([
      this.pool.query<CountRow>(
        'select count(*) as count from notifications where tenant_id = $1',
        [input.tenantId],
      ),
      this.pool.query<StatusCountRow>(
        'select status, count(*) as count from notifications where tenant_id = $1 group by status',
        [input.tenantId],
      ),
      this.pool.query<ChannelCountRow>(
        'select channel, count(*) as count from notifications where tenant_id = $1 group by channel',
        [input.tenantId],
      ),
      this.pool.query<DeliveryAttemptMetricsRow>(
        `
          select
            count(*) as total,
            count(*) filter (where status = 'delivered') as delivered,
            count(*) filter (where status = 'failed') as failed
          from delivery_attempts
          where tenant_id = $1
        `,
        [input.tenantId],
      ),
    ]);

    return {
      total: Number(requireSingleRow(totalResult.rows).count),
      byStatus: {
        queued: countByStatus(statusResult.rows, 'queued'),
        scheduled: countByStatus(statusResult.rows, 'scheduled'),
        processing: countByStatus(statusResult.rows, 'processing'),
        delivered: countByStatus(statusResult.rows, 'delivered'),
        failed: countByStatus(statusResult.rows, 'failed'),
        dead_lettered: countByStatus(statusResult.rows, 'dead_lettered'),
      },
      byChannel: {
        email: countByChannel(channelResult.rows, 'email'),
        sms: countByChannel(channelResult.rows, 'sms'),
        push: countByChannel(channelResult.rows, 'push'),
        webhook: countByChannel(channelResult.rows, 'webhook'),
      },
      deliveryAttempts: {
        total: Number(requireSingleRow(deliveryAttemptsResult.rows).total),
        delivered: Number(requireSingleRow(deliveryAttemptsResult.rows).delivered),
        failed: Number(requireSingleRow(deliveryAttemptsResult.rows).failed),
      },
    };
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
      allowedStatuses: ['queued', 'failed'],
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

  public async markFailed(
    id: string,
    tenantId: string,
    error: { errorCode: string; errorMessage: string },
  ): Promise<Notification | null> {
    return this.updateStatus({
      id,
      tenantId,
      status: 'failed',
      allowedStatuses: ['processing'],
      error,
    });
  }

  public async markDeadLettered(
    id: string,
    tenantId: string,
    error: { errorCode: string; errorMessage: string },
  ): Promise<Notification | null> {
    return this.updateStatus({
      id,
      tenantId,
      status: 'dead_lettered',
      allowedStatuses: ['processing', 'failed'],
      error,
      deadLetteredAt: new Date(),
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
    error?: { errorCode: string; errorMessage: string };
    deadLetteredAt?: Date;
  }): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `
        update notifications
        set
          status = $3,
          last_error_code = case when $3 = 'delivered' then null else coalesce($5, last_error_code) end,
          last_error_message = case when $3 = 'delivered' then null else coalesce($6, last_error_message) end,
          dead_lettered_at = coalesce($7, dead_lettered_at),
          updated_at = now()
        where id = $1 and tenant_id = $2 and status = any($4::text[])
        returning ${notificationColumns}
      `,
      [
        params.id,
        params.tenantId,
        params.status,
        params.allowedStatuses,
        params.error?.errorCode ?? null,
        params.error?.errorMessage ?? null,
        params.deadLetteredAt ?? null,
      ],
    );

    const row = result.rows[0];
    return row ? mapNotificationRow(row) : null;
  }
}

const notificationColumns = `
  id,
  tenant_id,
  idempotency_key,
  template_id,
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
  dead_lettered_at,
  last_error_code,
  last_error_message,
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
    templateId: row.template_id,
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
    deadLetteredAt: row.dead_lettered_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
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

function countByStatus(rows: StatusCountRow[], status: Notification['status']): number {
  const row = rows.find((candidate) => candidate.status === status);

  return row ? Number(row.count) : 0;
}

function countByChannel(rows: ChannelCountRow[], channel: Notification['channel']): number {
  const row = rows.find((candidate) => candidate.channel === channel);

  return row ? Number(row.count) : 0;
}
