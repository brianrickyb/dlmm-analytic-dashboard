import { describe, expect, it } from 'vitest';
import { loadDlmmSdk } from './dlmmSdk.js';

// No network calls — this only checks that the workaround in loadDlmmSdk()
// (createRequire loading the CJS build to sidestep @meteora-ag/dlmm's broken
// ESM entry and broken .d.ts) still resolves to an object shaped the way the
// rest of this codebase assumes. If @meteora-ag/dlmm is ever upgraded and its
// export shape changes, this fails loudly here instead of at request time —
// package.json pins the exact version specifically because the hand-written
// types in this file can no longer catch that drift at compile time.
describe('loadDlmmSdk', () => {
  it('exposes the DLMM static methods this project calls', () => {
    const DLMM = loadDlmmSdk();

    expect(typeof DLMM.create).toBe('function');
    expect(typeof DLMM.getAllLbPairPositionsByUser).toBe('function');
  });
});
