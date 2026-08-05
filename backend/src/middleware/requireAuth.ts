import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthResult = { kind: 'ok'; user: AuthenticatedUser } | { kind: 'invalid' } | { kind: 'unavailable' };

export type VerifyTokenFn = (token: string) => Promise<AuthResult>;

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function createRequireAuth(verifyToken: VerifyTokenFn | undefined) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!verifyToken) {
      reply.code(500).send({ error: 'Server is missing Supabase configuration.' });
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing bearer token.' });
      return;
    }

    const token = authHeader.slice('Bearer '.length);
    const result = await verifyToken(token);

    if (result.kind === 'unavailable') {
      reply.code(503).send({ error: 'Auth service is unavailable right now.' });
      return;
    }
    if (result.kind === 'invalid') {
      reply.code(401).send({ error: 'Invalid or expired session.' });
      return;
    }

    request.user = result.user;
  };
}
