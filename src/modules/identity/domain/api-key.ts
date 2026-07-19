export type ApiKeyStatus = 'active' | 'revoked';

export type ApiKey = {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  status: ApiKeyStatus;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export type ApiKeySecret = {
  prefix: string;
  secret: string;
  hash: string;
};
