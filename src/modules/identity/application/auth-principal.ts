export type AuthPrincipal = {
  tenantId: string;
  actorType: 'api_key' | 'jwt';
  actorId: string;
};
