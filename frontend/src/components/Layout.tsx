import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-6xl px-6 py-4">
          <Link to="/" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            DLMM Pool Analytics
          </Link>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Meteora DLMM pools on Solana — TVL, volume, fee APR & impermanent loss
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
