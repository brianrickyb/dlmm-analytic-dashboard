import type { SupabaseClient } from '@supabase/supabase-js';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

export interface UpsertActiveParams {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: string;
}

export interface SubscriptionsStore {
  upsertActive(params: UpsertActiveParams): Promise<void>;
  updateStatusBySubscriptionId(stripeSubscriptionId: string, status: SubscriptionStatus, currentPeriodEnd?: string): Promise<void>;
  getStatusByUserId(userId: string): Promise<SubscriptionStatus | null>;
  getStripeCustomerIdByUserId(userId: string): Promise<string | null>;
}

export function createSupabaseSubscriptionsStore(admin: SupabaseClient): SubscriptionsStore {
  return {
    async upsertActive(params) {
      const { error } = await admin.from('subscriptions').upsert({
        user_id: params.userId,
        stripe_customer_id: params.stripeCustomerId,
        stripe_subscription_id: params.stripeSubscriptionId,
        status: 'active',
        current_period_end: params.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`Failed to upsert subscription: ${error.message}`);
    },
    async updateStatusBySubscriptionId(stripeSubscriptionId, status, currentPeriodEnd) {
      const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (currentPeriodEnd) update.current_period_end = currentPeriodEnd;
      const { error } = await admin.from('subscriptions').update(update).eq('stripe_subscription_id', stripeSubscriptionId);
      if (error) throw new Error(`Failed to update subscription status: ${error.message}`);
    },
    async getStatusByUserId(userId) {
      const { data, error } = await admin.from('subscriptions').select('status').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(`Failed to read subscription status: ${error.message}`);
      return (data?.status as SubscriptionStatus | undefined) ?? null;
    },
    async getStripeCustomerIdByUserId(userId) {
      const { data, error } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(`Failed to read stripe customer id: ${error.message}`);
      return data?.stripe_customer_id ?? null;
    },
  };
}

export function createSubscriptionsService(store: SubscriptionsStore) {
  return {
    async isPremium(userId: string): Promise<boolean> {
      return (await store.getStatusByUserId(userId)) === 'active';
    },
    getStripeCustomerId(userId: string): Promise<string | null> {
      return store.getStripeCustomerIdByUserId(userId);
    },
    recordCheckoutCompleted(params: UpsertActiveParams): Promise<void> {
      return store.upsertActive(params);
    },
    recordSubscriptionStatus(stripeSubscriptionId: string, status: SubscriptionStatus, currentPeriodEnd?: string): Promise<void> {
      return store.updateStatusBySubscriptionId(stripeSubscriptionId, status, currentPeriodEnd);
    },
  };
}
