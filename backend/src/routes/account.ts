import type { FastifyInstance } from 'fastify';
import { createRequireAuth, type VerifyTokenFn } from '../middleware/requireAuth.js';
import { createSupabaseAdmin, createVerifyToken } from '../lib/supabaseAdmin.js';

export function registerAccountRoutes(app: FastifyInstance, deps: { verifyToken?: VerifyTokenFn } = {}): void {
  let verifyToken = deps.verifyToken;

  if (!verifyToken) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (url && secretKey) {
      verifyToken = createVerifyToken(createSupabaseAdmin(url, secretKey));
    }
  }

  const requireAuth = createRequireAuth(verifyToken);

  app.get('/api/account/me', { preHandler: requireAuth }, async (request) => {
    return { email: request.user!.email };
  });
}
