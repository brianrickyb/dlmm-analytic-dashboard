import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { registerPremiumRoutes } from './premium.js';

interface FakeStripeClient {
  checkout: { sessions: { create: (params: Record<string, unknown>) => Promise<Stripe.Checkout.Session> } };
  billingPortal: { sessions: { create: (params: Record<string, unknown>) => Promise<Stripe.BillingPortal.Session> } };
}

function fakeStripeClient(overrides: Partial<FakeStripeClient> = {}): FakeStripeClient {
  return {
    checkout: {
      sessions: { create: async () => ({ url: 'https://checkout.stripe.com/session/abc' }) as Stripe.Checkout.Session },
    },
    billingPortal: {
      sessions: { create: async () => ({ url: 'https://billing.stripe.com/session/xyz' }) as Stripe.BillingPortal.Session },
    },
    ...overrides,
  };
}

function buildApp(
  opts: {
    stripeClient?: FakeStripeClient;
    getStripeCustomerId?: () => Promise<string | null>;
    priceId?: string;
  } = {},
) {
  const app = Fastify();
  registerPremiumRoutes(app, {
    verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
    stripeClient: opts.stripeClient ?? fakeStripeClient(),
    subscriptionsService: { getStripeCustomerId: opts.getStripeCustomerId ?? (async () => null) },
    priceId: opts.priceId ?? 'price_test123',
  });
  return app;
}

describe('POST /api/premium/checkout', () => {
  it('returns the Stripe Checkout URL for a new subscriber', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/premium/checkout',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: 'https://checkout.stripe.com/session/abc' });
  });

  it('reuses the existing Stripe customer id when the user has subscribed before', async () => {
    let receivedParams: Record<string, unknown> | undefined;
    const app = buildApp({
      stripeClient: fakeStripeClient({
        checkout: {
          sessions: {
            create: async (params) => {
              receivedParams = params;
              return { url: 'https://checkout.stripe.com/session/abc' } as Stripe.Checkout.Session;
            },
          },
        },
      }),
      getStripeCustomerId: async () => 'cus_existing',
    });

    await app.inject({ method: 'POST', url: '/api/premium/checkout', headers: { authorization: 'Bearer good-token' } });

    expect(receivedParams?.customer).toBe('cus_existing');
    expect(receivedParams?.customer_email).toBeUndefined();
  });

  it('returns 401 when no token is provided', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/premium/checkout' });

    expect(response.statusCode).toBe(401);
  });

  it('returns 503 when Stripe throws', async () => {
    const app = buildApp({
      stripeClient: fakeStripeClient({
        checkout: {
          sessions: {
            create: async () => {
              throw new Error('stripe down');
            },
          },
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/premium/checkout',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(503);
  });
});

describe('POST /api/premium/portal', () => {
  it('returns the Billing Portal URL for an existing subscriber', async () => {
    const app = buildApp({ getStripeCustomerId: async () => 'cus_existing' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/premium/portal',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: 'https://billing.stripe.com/session/xyz' });
  });

  it('returns 400 when the user has never subscribed', async () => {
    const app = buildApp({ getStripeCustomerId: async () => null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/premium/portal',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/premium/portal' });

    expect(response.statusCode).toBe(401);
  });
});
