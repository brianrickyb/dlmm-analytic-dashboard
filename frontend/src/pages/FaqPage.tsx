import { glossary, type GlossaryCategory } from '../content/glossary';

const CATEGORY_ORDER: { key: GlossaryCategory; label: string }[] = [
  { key: 'web3-basics', label: 'Web3 & Crypto Basics' },
  { key: 'dlmm', label: 'DLMM & Liquidity Pools' },
  { key: 'trading', label: 'Screener & Trading' },
  { key: 'news', label: 'Reading Crypto News' },
];

export function FaqPage() {
  return (
    <div className="page-enter space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        FAQ
      </h1>

      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <h2 className="mb-2 font-semibold" style={{ color: 'var(--text)' }}>
          About this dashboard
        </h2>
        <p style={{ color: 'var(--muted)' }}>
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. The News, Screener, and Pools pages all use live public APIs and may be
          delayed, incomplete, or wrong. Always verify independently before making decisions.
        </p>
      </div>

      {CATEGORY_ORDER.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {cat.label}
          </h2>
          <div className="space-y-1.5">
            {glossary
              .filter((entry) => entry.category === cat.key)
              .map((entry) => (
                <details key={entry.key} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                  <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {entry.term}
                  </summary>
                  <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                    {entry.longDefinition}
                  </p>
                </details>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
