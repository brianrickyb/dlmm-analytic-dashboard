export type GlossaryCategory = 'web3-basics' | 'dlmm' | 'trading' | 'news';

export interface GlossaryEntry {
  key: string;
  term: string;
  shortDefinition: string;
  longDefinition: string;
  category: GlossaryCategory;
}

export const glossary: GlossaryEntry[] = [
  {
    key: 'wallet',
    term: 'Wallet',
    shortDefinition: 'An app that holds the keys proving you own your crypto assets.',
    longDefinition:
      "A wallet (e.g. Phantom, Solflare) is the app or device that holds the cryptographic keys proving you own crypto assets. It doesn't store money physically — it stores the private key that proves ownership on the blockchain.",
    category: 'web3-basics',
  },
  {
    key: 'blockchain',
    term: 'Blockchain',
    shortDefinition: 'A shared digital ledger recorded by many independent computers.',
    longDefinition:
      'A blockchain is a digital ledger recorded together by many independent computers (nodes), controlled by no single party, and very hard to alter once something is recorded on it.',
    category: 'web3-basics',
  },
  {
    key: 'token',
    term: 'Token / Cryptocurrency',
    shortDefinition: 'A digital asset that lives on a blockchain.',
    longDefinition:
      "A token or cryptocurrency is a digital asset that lives on a blockchain — it can be a currency (like SOL or BTC) or a project's own token representing some other value.",
    category: 'web3-basics',
  },
  {
    key: 'solana',
    term: 'Solana',
    shortDefinition: 'A fast, low-fee blockchain that apps like Meteora are built on — this dashboard is Solana-focused.',
    longDefinition:
      "Solana is a base blockchain (other apps build on top of it) known for fast, cheap transactions. This dashboard focuses on the Solana ecosystem — Meteora's DLMM pools live here.",
    category: 'web3-basics',
  },
  {
    key: 'stablecoin',
    term: 'Stablecoin',
    shortDefinition: 'A token pegged to a stable asset like the US dollar, e.g. USDC.',
    longDefinition:
      "A stablecoin is a token pegged to a stable asset (usually USD), e.g. USDC. It's used so its value doesn't swing wildly like most other tokens.",
    category: 'web3-basics',
  },
  {
    key: 'liquidityPool',
    term: 'Liquidity Pool',
    shortDefinition: 'A pool of two tokens that lets others swap between them.',
    longDefinition:
      'A liquidity pool is a pool of two tokens deposited by users ("liquidity providers", or LPs) so others can swap between them. LPs earn a share of the swap fees in return.',
    category: 'dlmm',
  },
  {
    key: 'dlmm',
    term: 'DLMM (Dynamic Liquidity Market Maker)',
    shortDefinition: "Meteora's bin-based liquidity model, an alternative to classic AMMs.",
    longDefinition:
      'DLMM is Meteora\'s automated market maker model, which splits a price range into discrete "bins" instead of a smooth curve (unlike classic constant-product AMMs like Uniswap v2) — allowing more concentrated liquidity and dynamic fees.',
    category: 'dlmm',
  },
  {
    key: 'binStep',
    term: 'Bin step',
    shortDefinition: "The price 'step size' between adjacent bins in a DLMM pool.",
    longDefinition:
      'Bin step is the price "step size" between adjacent bins in a DLMM pool, measured in basis points. A smaller bin step means tighter, more precise price granularity.',
    category: 'dlmm',
  },
  {
    key: 'tvl',
    term: 'TVL (Total Value Locked)',
    shortDefinition: 'The total dollar value of tokens currently deposited in a pool.',
    longDefinition: 'TVL (Total Value Locked) is the total current dollar value of both tokens deposited in a pool.',
    category: 'dlmm',
  },
  {
    key: 'feeApr',
    term: 'Fee APR',
    shortDefinition: 'Annualized return from swap fees, projected from just the last 24 hours.',
    longDefinition: 'Fee APR is an estimate of the annualized return LPs earn from swap fees, projected from the last 24 hours of fees.',
    category: 'dlmm',
  },
  {
    key: 'impermanentLoss',
    term: 'Impermanent Loss (IL)',
    shortDefinition: 'The value gap between providing liquidity and just holding the tokens.',
    longDefinition:
      "Impermanent loss is the value difference between providing liquidity in a pool versus simply holding the same tokens in a wallet, caused by the pool's price moving while you're providing liquidity.",
    category: 'dlmm',
  },
  {
    key: 'netYield',
    term: 'Net Yield',
    shortDefinition: 'Fees earned minus estimated impermanent loss.',
    longDefinition:
      'Net yield is fees earned minus estimated impermanent loss — the number that answers "was providing liquidity here actually better than just holding?"',
    category: 'dlmm',
  },
  {
    key: 'strategy',
    term: 'Strategy: Spot / Curve / Bid-Ask',
    shortDefinition: 'The three liquidity distribution shapes available in DLMM.',
    longDefinition:
      'DLMM offers three liquidity distribution shapes: Spot spreads evenly across the whole range, Curve concentrates near the current price, and Bid-Ask concentrates at both ends of the range (like an order book).',
    category: 'dlmm',
  },
  {
    key: 'long',
    term: 'Long',
    shortDefinition: 'A position that profits when the price goes up.',
    longDefinition: 'Going long means opening a position that profits when the price goes up — you are betting the price will rise.',
    category: 'trading',
  },
  {
    key: 'short',
    term: 'Short',
    shortDefinition: 'A position that profits when the price goes down.',
    longDefinition: 'Going short means opening a position that profits when the price goes down — you are betting the price will fall.',
    category: 'trading',
  },
  {
    key: 'fundingRate',
    term: 'Funding Rate',
    shortDefinition: 'A periodic payment between long and short traders in futures markets.',
    longDefinition:
      'Funding rate is a periodic payment between long and short traders in perpetual futures markets, keeping the futures price close to the spot price. A positive funding rate means longs are paying shorts — a sign more traders are long.',
    category: 'trading',
  },
  {
    key: 'longShortRatio',
    term: 'Long/Short Ratio',
    shortDefinition: 'The ratio of accounts holding long vs. short positions on a pair.',
    longDefinition:
      'Long/Short Ratio is the ratio of accounts holding long positions versus short positions on a trading pair — an indicator of which way the market is leaning.',
    category: 'trading',
  },
  {
    key: 'marketCapRank',
    term: 'Market Cap Rank',
    shortDefinition: "A coin's rank by total market value versus other coins.",
    longDefinition:
      "Market Cap Rank is a coin's rank by total market value (price × circulating supply) versus other coins — a lower number (#1, #2) means a larger, more established coin.",
    category: 'trading',
  },
  {
    key: 'trending',
    term: 'Trending',
    shortDefinition: 'A coin getting a lot of search attention right now — not a price signal.',
    longDefinition:
      'Trending means a coin is currently getting a lot of search attention on a given platform (here, CoinGecko) — a signal of market attention, not a guarantee the price will rise.',
    category: 'trading',
  },
  {
    key: 'bullish',
    term: 'Bullish',
    shortDefinition: 'Sentiment or opinion that the price will rise.',
    longDefinition: 'Bullish describes sentiment or opinion that the price of an asset will rise.',
    category: 'news',
  },
  {
    key: 'bearish',
    term: 'Bearish',
    shortDefinition: 'Sentiment or opinion that the price will fall.',
    longDefinition: 'Bearish describes sentiment or opinion that the price of an asset will fall.',
    category: 'news',
  },
  {
    key: 'fud',
    term: 'FUD (Fear, Uncertainty, Doubt)',
    shortDefinition: 'News or narratives that spread fear or doubt, often triggering selling.',
    longDefinition:
      'FUD stands for Fear, Uncertainty, Doubt — news or narratives, intentional or not, that spread fear or doubt, often triggering panic selling and price drops.',
    category: 'news',
  },
  {
    key: 'fomo',
    term: 'FOMO (Fear Of Missing Out)',
    shortDefinition: 'The urge to buy quickly out of fear of missing a price rise.',
    longDefinition:
      'FOMO stands for Fear Of Missing Out — the psychological urge to buy quickly out of fear of missing a price rise, which often leads people to buy right at a local peak.',
    category: 'news',
  },
  {
    key: 'whyNewsMovesPrice',
    term: 'Why news moves price',
    shortDefinition: 'Crypto markets are highly sentiment-driven.',
    longDefinition:
      'Crypto markets are heavily sentiment-driven; news (regulation, institutional adoption, hacks, etc.) can shift perceived risk fast, triggering mass buying or selling.',
    category: 'news',
  },
  {
    key: 'whyMultipleSources',
    term: 'Why multiple sources',
    shortDefinition: 'Different outlets can have different bias or blind spots.',
    longDefinition:
      "This dashboard aggregates several outlets (CoinDesk, Cointelegraph, The Block, Decrypt) so you're not relying on one outlet's bias or blind spots.",
    category: 'news',
  },
];
