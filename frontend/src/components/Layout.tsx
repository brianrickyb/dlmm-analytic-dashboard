import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              DLMM Pool Analytics
            </Link>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Meteora DLMM pools on Solana — TVL, volume, fee APR & impermanent loss
            </p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link to="/" style={{ color: 'var(--text-secondary)' }}>
              Pools
            </Link>
            <Link to="/news" style={{ color: 'var(--text-secondary)' }}>
              News
            </Link>
            <Link to="/screener" style={{ color: 'var(--text-secondary)' }}>
              Screener
            </Link>
            {session ? (
              <Link to="/account" style={{ color: 'var(--text-secondary)' }}>
                {session.user.email}
              </Link>
            ) : (
              <Link to="/login" style={{ color: 'var(--text-secondary)' }}>
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
