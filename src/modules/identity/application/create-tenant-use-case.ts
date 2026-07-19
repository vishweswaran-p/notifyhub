import { z } from 'zod';

import { TenantSlugAlreadyExistsError } from './identity-errors.js';

import type { ApiKeySecretService } from './api-key-secret-service.js';
import type { CreatedTenantCredentials, IdentityRepository } from './identity-repository.js';

const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  rateLimitPerMinute: z.number().int().positive().max(100_000).default(60),
  apiKeyName: z.string().trim().min(1).max(120).default('Default API key'),
});

export type CreateTenantCommand = z.input<typeof createTenantSchema>;

export type CreateTenantResult = CreatedTenantCredentials & {
  apiKeySecret: string;
};

export class CreateTenantUseCase {
  public constructor(
    private readonly repository: IdentityRepository,
    private readonly apiKeySecretService: ApiKeySecretService,
  ) {}

  public async execute(command: CreateTenantCommand): Promise<CreateTenantResult> {
    const input = createTenantSchema.parse(command);
    const apiKeySecret = this.apiKeySecretService.generate();

    try {
      const result = await this.repository.createTenantWithApiKey({
        ...input,
        apiKeySecret,
      });

      return {
        ...result,
        apiKeySecret: apiKeySecret.secret,
      };
    } catch (error) {
      if (isUniqueTenantSlugViolation(error)) {
        throw new TenantSlugAlreadyExistsError(input.slug);
      }

      throw error;
    }
  }
}

function isUniqueTenantSlugViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'tenants_slug_key'
  );
}
