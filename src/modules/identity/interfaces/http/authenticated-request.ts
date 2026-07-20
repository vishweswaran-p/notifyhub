import type { AuthPrincipal } from '@modules/identity/application/auth-principal.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPrincipal;
  }
}
