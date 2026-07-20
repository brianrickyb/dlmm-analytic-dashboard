import type { Pool, Token } from '../types/pool';

const sol: Token = { mintAddress: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL', decimals: 9 };
const usdc: Token = { mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6 };
const jup: Token = { mintAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6 };
const bonk: Token = { mintAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5 };
const jlp: Token = { mintAddress: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4', symbol: 'JLP', name: 'Jupiter Perps LP', decimals: 6 };
const jto: Token = { mintAddress: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', symbol: 'JTO', name: 'Jito', decimals: 9 };
const wif: Token = { mintAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', decimals: 6 };
const pyth: Token = { mintAddress: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH', name: 'Pyth Network', decimals: 6 };

export const pools: Pool[] = [
  { id: 'pool-sol-usdc', poolAddress: '5BJQ...9kPq', name: 'SOL-USDC', tokenX: sol, tokenY: usdc, binStep: 10, baseFeeBps: 10, isActive: true },
  { id: 'pool-jup-usdc', poolAddress: '3Zx8...m2Rf', name: 'JUP-USDC', tokenX: jup, tokenY: usdc, binStep: 20, baseFeeBps: 20, isActive: true },
  { id: 'pool-bonk-sol', poolAddress: '9Wq2...vT4z', name: 'BONK-SOL', tokenX: bonk, tokenY: sol, binStep: 100, baseFeeBps: 100, isActive: true },
  { id: 'pool-jlp-usdc', poolAddress: 'H7cL...pQ8w', name: 'JLP-USDC', tokenX: jlp, tokenY: usdc, binStep: 5, baseFeeBps: 5, isActive: true },
  { id: 'pool-jto-sol', poolAddress: 'C2vN...xR1k', name: 'JTO-SOL', tokenX: jto, tokenY: sol, binStep: 25, baseFeeBps: 25, isActive: true },
  { id: 'pool-wif-sol', poolAddress: 'B4tY...3nQj', name: 'WIF-SOL', tokenX: wif, tokenY: sol, binStep: 80, baseFeeBps: 80, isActive: true },
  { id: 'pool-pyth-usdc', poolAddress: 'F8mK...7dLc', name: 'PYTH-USDC', tokenX: pyth, tokenY: usdc, binStep: 20, baseFeeBps: 20, isActive: true },
  { id: 'pool-jup-sol', poolAddress: 'A1pW...5vBs', name: 'JUP-SOL', tokenX: jup, tokenY: sol, binStep: 25, baseFeeBps: 25, isActive: true },
];
