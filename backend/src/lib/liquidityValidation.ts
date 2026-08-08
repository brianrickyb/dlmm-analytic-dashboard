import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// @meteora-ag/dlmm's real MAX_BIN_LENGTH_ALLOWED_IN_ONE_TX constant is 26 —
// confirmed at runtime against the installed package (node -e), not guessed.
// That's a count of bins, so the id delta (inclusive range) must be <= 25.
const MAX_BIN_ID_DELTA = 25;

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

const nonNegativeNumericString = z.string().refine(
  (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  },
  { message: 'Amount must be a non-negative number.' },
);

export const buildTxRequestSchema = z
  .object({
    poolAddress: pubkeyString,
    userPublicKey: pubkeyString,
    amountX: nonNegativeNumericString,
    amountY: nonNegativeNumericString,
    minBinId: z.number().int(),
    maxBinId: z.number().int(),
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
