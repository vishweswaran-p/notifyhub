import type { AuthPrincipal } from '../../application/auth-principal.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPrincipal;
  }
}
