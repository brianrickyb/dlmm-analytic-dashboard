import type { FastifyInstance } from 'fastify';
import { createRequireAuth, type VerifyTokenFn } from '../middleware/requireAuth.js';
import { createSupabaseAdmin, createVerifyToken } from '../lib/supabaseAdmin.js';
import { createSubscriptionsService, createSupabaseSubscriptionsStore } from '../services/subscriptions.js';

interface SubscriptionsServiceLike {
  isPremium(userId: string): Promise<boolean>;
}

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: { verifyToken?: VerifyTokenFn; subscriptionsService?: SubscriptionsServiceLike } = {},
): void {
  let verifyToken = deps.verifyToken;

  if (!verifyToken) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (url && secretKey) {
      verifyToken = createVerifyToken(createSupabaseAdmin(url, secretKey));
    }
  }

  let subscriptionsService = deps.subscriptionsService;
  if (!subscriptionsService) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (url && secretKey) {
      subscriptionsService = createSubscriptionsService(createSupabaseSubscriptionsStore(createSupabaseAdmin(url, secretKey)));
    }
  }

  const requireAuth = createRequireAuth(verifyToken);

  app.get('/api/account/me', { preHandler: requireAuth }, async (request) => {
    const isPremium = subscriptionsService ? await subscriptionsService.isPremium(request.user!.id) : false;
    return { email: request.user!.email, isPremium };
  });
}
