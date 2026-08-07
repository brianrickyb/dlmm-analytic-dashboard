import { describe, expect, it } from 'vitest';
import { createSubscriptionsService, type SubscriptionsStore, type SubscriptionStatus } from './subscriptions.js';

interface FakeRecord {
  status: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

function fakeStore(initial: Record<string, FakeRecord> = {}): SubscriptionsStore {
  const records: Record<string, FakeRecord> = { ...initial };
  return {
    async upsertActive(params) {
      records[params.userId] = {
        status: 'active',
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
      };
    },
    async updateStatusBySubscriptionId(stripeSubscriptionId, status) {
      const entry = Object.values(records).find((r) => r.stripeSubscriptionId === stripeSubscriptionId);
      if (entry) entry.status = status;
    },
    async getStatusByUserId(userId) {
      return records[userId]?.status ?? null;
    },
    async getStripeCustomerIdByUserId(userId) {
      return records[userId]?.stripeCustomerId ?? null;
    },
  };
}

describe('createSubscriptionsService', () => {
  it('isPremium returns true when status is active', async () => {
    const store = fakeStore({ 'user-1': { status: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' } });
    const service = createSubscriptionsService(store);

    expect(await service.isPremium('user-1')).toBe(true);
  });

  it('isPremium returns false when status is canceled', async () => {
    const store = fakeStore({ 'user-1': { status: 'canceled', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' } });
    const service = createSubscriptionsService(store);

    expect(await service.isPremium('user-1')).toBe(false);
  });

  it('isPremium returns false when the user has no subscription row at all', async () => {
    const service = createSubscriptionsService(fakeStore());

    expect(await service.isPremium('never-subscribed')).toBe(false);
  });

  it('getStripeCustomerId returns null when the user has no subscription row', async () => {
    const service = createSubscriptionsService(fakeStore());

    expect(await service.getStripeCustomerId('user-1')).toBeNull();
  });

  it('recordCheckoutCompleted upserts an active subscription', async () => {
    const service = createSubscriptionsService(fakeStore());

    await service.recordCheckoutCompleted({
      userId: 'user-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: '2026-09-05T00:00:00.000Z',
    });

    expect(await service.isPremium('user-1')).toBe(true);
    expect(await service.getStripeCustomerId('user-1')).toBe('cus_1');
  });

  it('recordSubscriptionStatus updates status by subscription id', async () => {
    const store = fakeStore({ 'user-1': { status: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' } });
    const service = createSubscriptionsService(store);

    await service.recordSubscriptionStatus('sub_1', 'canceled');

    expect(await service.isPremium('user-1')).toBe(false);
  });
});
