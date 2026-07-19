export type TenantStatus = 'active' | 'suspended';

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  rateLimitPerMinute: number;
  createdAt: Date;
  updatedAt: Date;
};
