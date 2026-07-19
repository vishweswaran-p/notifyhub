import { ApplicationError } from '../../../shared/errors/application-error.js';

export class NotificationTemplateNotFoundError extends ApplicationError {
  public constructor(templateId: string) {
    super({
      code: 'NOTIFICATION_TEMPLATE_NOT_FOUND',
      message: 'Notification template was not found.',
      statusCode: 404,
      details: { templateId },
    });
  }
}

export class NotificationTemplateChannelMismatchError extends ApplicationError {
  public constructor(params: { templateChannel: string; requestedChannel: string }) {
    super({
      code: 'NOTIFICATION_TEMPLATE_CHANNEL_MISMATCH',
      message: 'Notification template channel does not match the requested notification channel.',
      statusCode: 400,
      details: params,
    });
  }
}

export class NotificationTemplateNameAlreadyExistsError extends ApplicationError {
  public constructor(name: string) {
    super({
      code: 'NOTIFICATION_TEMPLATE_NAME_ALREADY_EXISTS',
      message: `Notification template "${name}" already exists.`,
      statusCode: 409,
      details: { name },
    });
  }
}
