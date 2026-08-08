import { describe, expect, it } from 'vitest';
import { parseBuildTxRequest } from './liquidityValidation.js';

const validPoolAddress = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';
const validUserPublicKey = '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q';

function baseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    poolAddress: validPoolAddress,
    amountX: '1000000',
    amountY: '1000000',
    minBinId: 100,
    maxBinId: 120,
    userPublicKey: validUserPublicKey,
    ...overrides,
  };
}

describe('parseBuildTxRequest', () => {
  it('accepts a well-formed request', () => {
    const result = parseBuildTxRequest(baseBody());
    expect(result.success).toBe(true);
  });

  it('rejects an invalid poolAddress', () => {
    const result = parseBuildTxRequest(baseBody({ poolAddress: 'not-a-pubkey' }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid userPublicKey', () => {
    const result = parseBuildTxRequest(baseBody({ userPublicKey: 'not-a-pubkey' }));
    expect(result.success).toBe(false);
  });

  it('rejects amountX/amountY that are both zero', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '0', amountY: '0' }));
    expect(result.success).toBe(false);
  });

  it('rejects a negative amount', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '-5' }));
    expect(result.success).toBe(false);
  });

  it('rejects a decimal amount (new BN() only accepts integer strings)', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '1.5' }));
    expect(result.success).toBe(false);
  });

  it('rejects scientific notation', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '1e21' }));
    expect(result.success).toBe(false);
  });

  it('rejects a hex-prefixed amount', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '0x1f' }));
    expect(result.success).toBe(false);
  });

  it('rejects an empty amount string', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '', amountY: '0' }));
    expect(result.success).toBe(false);
  });

  it('rejects minBinId > maxBinId', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: 200, maxBinId: 100 }));
    expect(result.success).toBe(false);
  });

  it('rejects a bin range wider than the allowed span', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: 0, maxBinId: 5000 }));
    expect(result.success).toBe(false);
  });

  it('accepts a bin range exactly at the allowed span (26 bins)', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: 0, maxBinId: 25 }));
    expect(result.success).toBe(true);
  });

  it('rejects a bin range one past the allowed span (27 bins)', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: 0, maxBinId: 26 }));
    expect(result.success).toBe(false);
  });

  it('rejects a bin id beyond the SDK-real bounds', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: -400000, maxBinId: -400000 + 10 }));
    expect(result.success).toBe(false);
  });

  it('rejects a slippageBps outside 1-2000', () => {
    const result = parseBuildTxRequest(baseBody({ slippageBps: 5000 }));
    expect(result.success).toBe(false);
  });

  it('defaults slippageBps to 100 when omitted', () => {
    const result = parseBuildTxRequest(baseBody());
    if (!result.success) throw new Error('expected success');
    expect(result.data.slippageBps).toBe(100);
  });
});
