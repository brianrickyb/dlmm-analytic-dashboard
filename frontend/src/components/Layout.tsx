import { useEffect, useState } from 'react';
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

function SidebarLink({ to, label, onNavigate }: { to: string; label: ReactNode; onNavigate: () => void }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="rounded-full px-3 py-2 text-sm font-medium"
      style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Link>
  );
}

function Wordmark() {
  return (
    <>
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        D
      </span>
      <span className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        DLMM Pool Analytics
      </span>
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { session } = useAuth();

  return (
    <div className="flex h-full flex-col p-4">
      <Link to="/" onClick={onNavigate} className="mb-6 flex items-center gap-2">
        <Wordmark />
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_LINKS.map((link) => (
          <SidebarLink key={link.to} to={link.to} label={link.label} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        {session ? (
          <SidebarLink to="/account" label={session.user.email} onNavigate={onNavigate} />
        ) : (
          <SidebarLink to="/login" label="Login" onNavigate={onNavigate} />
        )}
        <WalletConnectButton />
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen md:pl-56">
      <aside
        className="fixed inset-y-0 left-0 z-20 hidden w-56 border-r md:block"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
      >
        <SidebarContent onNavigate={() => {}} />
      </aside>

      <header
        className="flex items-center justify-between border-b px-4 py-3 md:hidden"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
      >
        <Link to="/" className="flex items-center gap-2">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 flex-col items-center justify-center gap-1"
        >
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
        </button>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setDrawerOpen(false)} />
          <aside
            className="absolute inset-y-0 left-0 w-64 border-r"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
