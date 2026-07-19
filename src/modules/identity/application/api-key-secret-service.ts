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
    const parts = secret.split('_');

    if (parts.length !== 4 || parts[0] !== 'nh' || parts[1] !== 'live') {
      return null;
    }

    const prefix = parts[2];
    return prefix && /^[a-f0-9]{12}$/.test(prefix) ? prefix : null;
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
