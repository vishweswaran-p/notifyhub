import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { ApiKeySecret } from '../domain/api-key.js';

const apiKeyPrefix = 'nh_live';

export class ApiKeySecretService {
  public constructor(private readonly pepper: string) {}

  public generate(): ApiKeySecret {
    const prefix = randomBytes(6).toString('hex');
    const secret = `${apiKeyPrefix}_${prefix}_${randomBytes(24).toString('base64url')}`;

    return {
      prefix,
      secret,
      hash: this.hash(secret),
    };
  }

  public extractPrefix(secret: string): string | null {
    const match = /^nh_live_([a-f0-9]{12})_/.exec(secret);

    return match?.[1] ?? null;
  }

  public verify(candidate: string, expectedHash: string): boolean {
    const candidateHash = this.hash(candidate);
    const candidateBuffer = Buffer.from(candidateHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  }

  private hash(secret: string): string {
    return createHash('sha256').update(`${this.pepper}:${secret}`).digest('hex');
  }
}
