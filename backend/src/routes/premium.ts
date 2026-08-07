import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { createRequireAuth, type VerifyTokenFn } from '../middleware/requireAuth.js';
import { createSupabaseAdmin, createVerifyToken } from '../lib/supabaseAdmin.js';
import { createStripeClient } from '../lib/stripe.js';
import { createSubscriptionsService, createSupabaseSubscriptionsStore } from '../services/subscriptions.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

interface SubscriptionsServiceLike {
  getStripeCustomerId(userId: string): Promise<string | null>;
}

interface StripeClientLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: Stripe.BillingPortal.SessionCreateParams): Promise<Stripe.BillingPortal.Session>;
    };
  };
}

interface PremiumRouteDeps {
  verifyToken?: VerifyTokenFn;
  stripeClient?: StripeClientLike;
  subscriptionsService?: SubscriptionsServiceLike;
  priceId?: string;
}

export function registerPremiumRoutes(app: FastifyInstance, deps: PremiumRouteDeps = {}): void {
  let verifyToken = deps.verifyToken;
  if (!verifyToken) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (url && secretKey) {
      verifyToken = createVerifyToken(createSupabaseAdmin(url, secretKey));
    }
  }
  const requireAuth = createRequireAuth(verifyToken);

  const stripeClient: StripeClientLike | undefined =
    deps.stripeClient ?? (process.env.STRIPE_SECRET_KEY ? createStripeClient(process.env.STRIPE_SECRET_KEY) : undefined);

  let subscriptionsService = deps.subscriptionsService;
  if (!subscriptionsService) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (url && secretKey) {
      subscriptionsService = createSubscriptionsService(createSupabaseSubscriptionsStore(createSupabaseAdmin(url, secretKey)));
    }
  }

  const priceId = deps.priceId ?? process.env.STRIPE_PRICE_ID;

  app.post('/api/premium/checkout', { preHandler: requireAuth }, async (request, reply) => {
    if (!stripeClient || !subscriptionsService || !priceId) {
      reply.code(500);
      return { error: 'Server is missing Stripe configuration.' };
    }

    const user = request.user!;
    try {
      const existingCustomerId = await subscriptionsService.getStripeCustomerId(user.id);
      const session = await stripeClient.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: user.id,
        ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: user.email }),
        success_url: `${FRONTEND_URL}/upgrade?success=true`,
        cancel_url: `${FRONTEND_URL}/upgrade`,
      });

      if (!session.url) {
        reply.code(503);
        return { error: 'Stripe did not return a checkout URL.' };
      }
      return { url: session.url };
    } catch {
      reply.code(503);
      return { error: 'Unable to start checkout right now.' };
    }
  });

  app.post('/api/premium/portal', { preHandler: requireAuth }, async (request, reply) => {
    if (!stripeClient || !subscriptionsService) {
      reply.code(500);
      return { error: 'Server is missing Stripe configuration.' };
    }

    const user = request.user!;
    try {
      const customerId = await subscriptionsService.getStripeCustomerId(user.id);
      if (!customerId) {
        reply.code(400);
        return { error: 'No subscription found for this account.' };
      }

      const session = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${FRONTEND_URL}/upgrade`,
      });
      return { url: session.url };
    } catch {
      reply.code(503);
      return { error: 'Unable to open the billing portal right now.' };
    }
  });
}
