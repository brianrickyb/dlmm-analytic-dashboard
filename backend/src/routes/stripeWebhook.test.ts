import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { registerStripeWebhookRoutes, type ConstructEventFn } from './stripeWebhook.js';
import type { SubscriptionStatus, UpsertActiveParams } from '../services/subscriptions.js';

function fakeSubscriptionsService() {
  const checkoutCalls: UpsertActiveParams[] = [];
  const statusCalls: { subscriptionId: string; status: SubscriptionStatus; currentPeriodEnd?: string }[] = [];
  return {
    checkoutCalls,
    statusCalls,
    async recordCheckoutCompleted(params: UpsertActiveParams) {
      checkoutCalls.push(params);
    },
    async recordSubscriptionStatus(stripeSubscriptionId: string, status: SubscriptionStatus, currentPeriodEnd?: string) {
      statusCalls.push({ subscriptionId: stripeSubscriptionId, status, currentPeriodEnd });
    },
  };
}

function buildApp(constructEvent: ConstructEventFn, subscriptionsService = fakeSubscriptionsService()) {
  const app = Fastify();
  registerStripeWebhookRoutes(app, {
    constructEvent,
    webhookSecret: 'whsec_test',
    subscriptionsService,
  });
  return { app, subscriptionsService };
}

function postWebhook(app: ReturnType<typeof Fastify>) {
  return app.inject({
    method: 'POST',
    url: '/api/stripe/webhook',
    headers: { 'stripe-signature': 'test-sig', 'content-type': 'application/json' },
    payload: Buffer.from('{}'),
  });
}

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when the signature is invalid', async () => {
    const { app } = buildApp(() => {
      throw new Error('invalid signature');
    });

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when the Stripe-Signature header is missing', async () => {
    const { app } = buildApp(() => ({ type: 'checkout.session.completed' }) as Stripe.Event);

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/webhook',
      headers: { 'content-type': 'application/json' },
      payload: Buffer.from('{}'),
    });

    expect(response.statusCode).toBe(400);
  });

  it('records an active subscription on checkout.session.completed', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(200);
    expect(subscriptionsService.checkoutCalls).toEqual([
      { userId: 'user-1', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', currentPeriodEnd: expect.any(String) },
    ]);
  });

  it('ignores checkout.session.completed when client_reference_id is missing', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: null, customer: 'cus_1', subscription: 'sub_1' } },
    } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(200);
    expect(subscriptionsService.checkoutCalls).toEqual([]);
  });

  it('updates status and period end on customer.subscription.updated', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          items: { data: [{ current_period_end: 1780000000 }] },
        },
      },
    } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(200);
    expect(subscriptionsService.statusCalls).toEqual([
      { subscriptionId: 'sub_1', status: 'active', currentPeriodEnd: new Date(1780000000 * 1000).toISOString() },
    ]);
  });

  it('maps an unrecognized subscription status to canceled', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'unpaid',
          items: { data: [{ current_period_end: 1780000000 }] },
        },
      },
    } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    await postWebhook(app);

    expect(subscriptionsService.statusCalls[0]?.status).toBe('canceled');
  });

  it('marks the subscription canceled on customer.subscription.deleted', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(200);
    expect(subscriptionsService.statusCalls).toEqual([{ subscriptionId: 'sub_1', status: 'canceled', currentPeriodEnd: undefined }]);
  });

  it('marks the subscription active on invoice.paid', async () => {
    const event = {
      type: 'invoice.paid',
      data: { object: { parent: { subscription_details: { subscription: 'sub_1' } } } },
    } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(200);
    expect(subscriptionsService.statusCalls).toEqual([{ subscriptionId: 'sub_1', status: 'active', currentPeriodEnd: undefined }]);
  });

  it('acknowledges unhandled event types without acting', async () => {
    const event = { type: 'customer.created', data: { object: {} } } as unknown as Stripe.Event;

    const { app, subscriptionsService } = buildApp(() => event);

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(200);
    expect(subscriptionsService.checkoutCalls).toEqual([]);
    expect(subscriptionsService.statusCalls).toEqual([]);
  });

  it('returns 500 when Stripe configuration is missing', async () => {
    const app = Fastify();
    registerStripeWebhookRoutes(app, {});

    const response = await postWebhook(app);

    expect(response.statusCode).toBe(500);
  });
});
