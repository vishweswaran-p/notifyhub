import { ProviderDeliveryError } from './providers/provider-delivery-error.js';

import type { NotificationDeliveryJobPayload } from './notification-queue-publisher.js';
import type { NotificationRepository } from './notification-repository.js';
import type { NotificationProviderRegistry } from './providers/notification-provider.js';

export type DeliverNotificationResult =
  | {
      outcome: 'delivered';
      notificationId: string;
      provider: string;
      providerMessageId: string;
    }
  | {
      outcome: 'failed';
      notificationId: string;
      provider: string;
      errorCode: string;
    }
  | {
      outcome: 'skipped';
      notificationId: string;
      reason: string;
    };

export class DeliverNotificationUseCase {
  public constructor(
    private readonly repository: NotificationRepository,
    private readonly providerRegistry: NotificationProviderRegistry,
  ) {}

  public async execute(
    payload: NotificationDeliveryJobPayload,
  ): Promise<DeliverNotificationResult> {
    const notification = await this.repository.findByIdForTenant(
      payload.notificationId,
      payload.tenantId,
    );

    if (!notification) {
      return {
        outcome: 'skipped',
        notificationId: payload.notificationId,
        reason: 'notification_not_found',
      };
    }

    if (notification.channel !== payload.channel) {
      return {
        outcome: 'skipped',
        notificationId: payload.notificationId,
        reason: 'channel_mismatch',
      };
    }

    if (notification.status === 'delivered') {
      return {
        outcome: 'skipped',
        notificationId: notification.id,
        reason: 'already_delivered',
      };
    }

    const provider = this.providerRegistry.get(notification.channel);
    const attemptNumber = await this.repository.nextAttemptNumber(notification.id);
    const startedAt = new Date();
    const processing = await this.repository.markProcessing(notification.id, notification.tenantId);

    if (!processing) {
      return {
        outcome: 'skipped',
        notificationId: notification.id,
        reason: 'status_transition_rejected',
      };
    }

    await this.repository.recordDeliveryAttempt({
      notificationId: notification.id,
      tenantId: notification.tenantId,
      channel: notification.channel,
      provider: provider.name,
      status: 'processing',
      attemptNumber,
      providerMessageId: null,
      errorCode: null,
      errorMessage: null,
      responseMetadata: {},
      startedAt,
      completedAt: null,
    });

    try {
      const result = await provider.deliver(processing);
      const completedAt = new Date();

      await this.repository.markDelivered(notification.id, notification.tenantId);
      await this.repository.recordDeliveryAttempt({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
        provider: provider.name,
        status: 'delivered',
        attemptNumber,
        providerMessageId: result.providerMessageId,
        errorCode: null,
        errorMessage: null,
        responseMetadata: result.metadata,
        startedAt,
        completedAt,
      });

      return {
        outcome: 'delivered',
        notificationId: notification.id,
        provider: provider.name,
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      const completedAt = new Date();
      const normalizedError = normalizeProviderError(error);

      await this.repository.markFailed(notification.id, notification.tenantId);
      await this.repository.recordDeliveryAttempt({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
        provider: provider.name,
        status: 'failed',
        attemptNumber,
        providerMessageId: null,
        errorCode: normalizedError.code,
        errorMessage: normalizedError.message,
        responseMetadata: normalizedError.metadata,
        startedAt,
        completedAt,
      });

      return {
        outcome: 'failed',
        notificationId: notification.id,
        provider: provider.name,
        errorCode: normalizedError.code,
      };
    }
  }
}

function normalizeProviderError(error: unknown): {
  code: string;
  message: string;
  metadata: Record<string, unknown>;
} {
  if (error instanceof ProviderDeliveryError) {
    return {
      code: error.code,
      message: error.message,
      metadata: error.metadata,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'PROVIDER_DELIVERY_FAILED',
      message: error.message,
      metadata: {},
    };
  }

  return {
    code: 'PROVIDER_DELIVERY_FAILED',
    message: 'Provider delivery failed.',
    metadata: {},
  };
}
