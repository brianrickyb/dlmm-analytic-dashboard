export class SolanaUnavailableError extends Error {
  constructor(message = 'Solana RPC is unavailable right now.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'SolanaUnavailableError';
  }
}

export class PoolNotFoundError extends Error {
  constructor(poolAddress: string) {
    super(`Pool ${poolAddress} was not found on-chain.`);
    this.name = 'PoolNotFoundError';
  }
}
