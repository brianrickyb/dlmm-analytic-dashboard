import { glossary, type GlossaryCategory } from '../content/glossary';

const CATEGORY_ORDER: { key: GlossaryCategory; label: string }[] = [
  { key: 'web3-basics', label: 'Web3 & Crypto Basics' },
  { key: 'dlmm', label: 'DLMM & Liquidity Pools' },
  { key: 'trading', label: 'Screener & Trading' },
  { key: 'news', label: 'Reading Crypto News' },
];

export function FaqPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        FAQ
      </h1>

      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <h2 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
          About this dashboard
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. The News and Screener pages use live public APIs and may be delayed,
          incomplete, or wrong; the Pools page uses generated sample data for this demo, not live
          Meteora data. Always verify independently before making decisions.
        </p>
      </div>

      {CATEGORY_ORDER.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {cat.label}
          </h2>
          <div
            className="divide-y divide-[color:var(--gridline)] rounded-lg border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            {glossary
              .filter((entry) => entry.category === cat.key)
              .map((entry) => (
                <details key={entry.key} className="p-4">
                  <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {entry.term}
                  </summary>
                  <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
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
