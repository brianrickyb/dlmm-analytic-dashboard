import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { createStripeClient } from '../lib/stripe.js';
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import {
  createSubscriptionsService,
  createSupabaseSubscriptionsStore,
  type SubscriptionStatus,
  type UpsertActiveParams,
} from '../services/subscriptions.js';

interface SubscriptionsServiceLike {
  recordCheckoutCompleted(params: UpsertActiveParams): Promise<void>;
  recordSubscriptionStatus(stripeSubscriptionId: string, status: SubscriptionStatus, currentPeriodEnd?: string): Promise<void>;
}

export type ConstructEventFn = (payload: Buffer, signature: string, secret: string) => Stripe.Event;

export interface StripeWebhookDeps {
  constructEvent?: ConstructEventFn;
  webhookSecret?: string;
  subscriptionsService?: SubscriptionsServiceLike;
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): string {
  const item = sub.items.data[0];
  return new Date(item.current_period_end * 1000).toISOString();
}

// This project's DB models three states; Stripe's real status has more
// (trialing, incomplete, unpaid, paused, ...). Anything that isn't active or
// past_due is treated as canceled — appropriate since this project has no
// trial period and only one plan.
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  return 'canceled';
}

export function registerStripeWebhookRoutes(app: FastifyInstance, deps: StripeWebhookDeps = {}): void {
  const webhookSecret = deps.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;

  let constructEvent = deps.constructEvent;
  if (!constructEvent) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      const stripe = createStripeClient(secretKey);
      constructEvent = (payload, signature, secret) => stripe.webhooks.constructEvent(payload, signature, secret);
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

  // Registered as a nested plugin so the raw-body content type parser below
  // only applies to this route, not the JSON routes registered on `app`.
  app.register(async function webhookPlugin(instance) {
    instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    instance.post('/api/stripe/webhook', async (request, reply) => {
      if (!constructEvent || !webhookSecret || !subscriptionsService) {
        reply.code(500);
        return { error: 'Server is missing Stripe configuration.' };
      }

      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        reply.code(400);
        return { error: 'Missing Stripe-Signature header.' };
      }

      let event: Stripe.Event;
      try {
        event = constructEvent(request.body as Buffer, signature, webhookSecret);
      } catch {
        reply.code(400);
        return { error: 'Invalid webhook signature.' };
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id;
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
          if (userId && customerId && subscriptionId) {
            // current_period_end isn't on the Checkout Session itself; the
            // customer.subscription.updated event that follows moments later
            // corrects this with the real value.
            await subscriptionsService.recordCheckoutCompleted({
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              currentPeriodEnd: new Date().toISOString(),
            });
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          await subscriptionsService.recordSubscriptionStatus(sub.id, mapStatus(sub.status), subscriptionPeriodEnd(sub));
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await subscriptionsService.recordSubscriptionStatus(sub.id, 'canceled');
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionRef = invoice.parent?.subscription_details?.subscription;
          const subscriptionId = typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;
          if (subscriptionId) {
            await subscriptionsService.recordSubscriptionStatus(subscriptionId, 'active');
          }
          break;
        }
        default:
          break;
      }

      return { received: true };
    });
  });
}
