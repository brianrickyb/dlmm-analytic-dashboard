import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { WalletConnectButton } from './WalletConnectButton';

const NAV_LINKS = [
  { to: '/', label: 'Pools' },
  { to: '/news', label: 'News' },
  { to: '/screener', label: 'Screener' },
  { to: '/faq', label: 'FAQ' },
  { to: '/positions', label: 'My Positions' },
];

function HeaderLink({ to, label }: { to: string; label: ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className="border-b-2 pb-1 font-medium"
      style={{
        borderColor: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/" className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              DLMM Pool Analytics
            </Link>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Meteora DLMM pools on Solana — TVL, volume, fee APR & impermanent loss
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_LINKS.map((link) => (
              <HeaderLink key={link.to} to={link.to} label={link.label} />
            ))}
            {session ? <HeaderLink to="/account" label={session.user.email} /> : <HeaderLink to="/login" label="Login" />}
            <WalletConnectButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
