import { ApplicationError } from '../../../shared/errors/application-error.js';

export class TenantSlugAlreadyExistsError extends ApplicationError {
  public constructor(slug: string) {
    super({
      code: 'TENANT_SLUG_ALREADY_EXISTS',
      message: `Tenant slug "${slug}" is already in use.`,
      statusCode: 409,
      details: { slug },
    });
  }
}

export class InvalidCredentialsError extends ApplicationError {
  public constructor() {
    super({
      code: 'INVALID_CREDENTIALS',
      message: 'The supplied credentials are invalid.',
      statusCode: 401,
    });
  }
}

export class TenantNotFoundError extends ApplicationError {
  public constructor() {
    super({
      code: 'TENANT_NOT_FOUND',
      message: 'Tenant was not found.',
      statusCode: 404,
    });
  }
}
