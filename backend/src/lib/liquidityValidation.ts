import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// @meteora-ag/dlmm's real MAX_BIN_LENGTH_ALLOWED_IN_ONE_TX constant is 26 —
// confirmed at runtime against the installed package (node -e), not guessed.
// That's a count of bins, so the id delta (inclusive range) must be <= 25.
const MAX_BIN_ID_DELTA = 25;

// The SDK's real MAX_BIN_ID_PER_BIN_STEP constant — also confirmed at runtime
// — bounds how far a bin id can legally be from the pool's active bin.
const MAX_BIN_ID = 351639;

const pubkeyString = z.string().refine(
  (value) => {
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Not a valid Solana public key.' },
);

// Amounts are raw base units (the smallest denomination, matching the token's
// decimals) fed directly into `new BN(value)`, which only accepts base-10
// digit strings — no decimals, no scientific notation, no leading "0x". A
// looser check (e.g. `Number.isFinite`) would let values like "1.5" or "1e21"
// pass validation and then throw inside `new BN()`, surfacing as a
// misleading "Solana unavailable" 503 instead of a 400.
const nonNegativeIntegerString = z.string().refine((value) => /^\d+$/.test(value), {
  message: 'Amount must be a non-negative integer in base units (e.g. "1000000", no decimals).',
});

export const buildTxRequestSchema = z
  .object({
    poolAddress: pubkeyString,
    userPublicKey: pubkeyString,
    amountX: nonNegativeIntegerString,
    amountY: nonNegativeIntegerString,
    minBinId: z.number().int().min(-MAX_BIN_ID).max(MAX_BIN_ID),
    maxBinId: z.number().int().min(-MAX_BIN_ID).max(MAX_BIN_ID),
    slippageBps: z.number().int().min(1).max(2000).default(100),
  })
  .refine((data) => data.minBinId <= data.maxBinId, {
    message: 'minBinId must be less than or equal to maxBinId.',
    path: ['minBinId'],
  })
  .refine((data) => data.maxBinId - data.minBinId <= MAX_BIN_ID_DELTA, {
    message: `Bin range cannot span more than ${MAX_BIN_ID_DELTA + 1} bins.`,
    path: ['maxBinId'],
  })
  .refine((data) => Number(data.amountX) > 0 || Number(data.amountY) > 0, {
    message: 'At least one of amountX or amountY must be greater than zero.',
    path: ['amountX'],
  });

export type BuildTxRequest = z.infer<typeof buildTxRequestSchema>;

export function parseBuildTxRequest(
  body: unknown,
): { success: true; data: BuildTxRequest } | { success: false; error: string } {
  const result = buildTxRequestSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message ?? 'Invalid request body.' };
  }
  return { success: true, data: result.data };
}
