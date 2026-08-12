import { useEffect, useRef, useState } from 'react';
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

const DRAWER_ID = 'mobile-nav-drawer';
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SidebarLink({
  to,
  label,
  onNavigate,
  truncate = false,
}: {
  to: string;
  label: ReactNode;
  onNavigate: () => void;
  truncate?: boolean;
}) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={truncate && typeof label === 'string' ? label : undefined}
      className={`min-w-0 rounded-full px-3 py-2 text-sm font-medium ${truncate ? 'truncate' : ''}`}
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
          <SidebarLink to="/account" label={session.user.email} onNavigate={onNavigate} truncate />
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
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Close the drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // If the viewport grows past the sidebar breakpoint while the drawer is
  // open, close it — otherwise `inert`/scroll-lock state could persist onto
  // the desktop layout, where there's no drawer left to close it from.
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setDrawerOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // While open: lock body scroll, move focus into the drawer, trap Tab
  // inside it, and return focus to the trigger button on close.
  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const drawer = drawerRef.current;
    const focusable = drawer ? Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    focusable[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      hamburgerRef.current?.focus();
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
        inert={drawerOpen}
      >
        <Link to="/" className="flex items-center gap-2">
          <Wordmark />
        </Link>
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          aria-controls={DRAWER_ID}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1"
        >
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
        </button>
      </header>

      <div className="fixed inset-0 z-30 md:hidden" style={{ pointerEvents: drawerOpen ? 'auto' : 'none' }} inert={!drawerOpen}>
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.4)', opacity: drawerOpen ? 1 : 0, transition: 'opacity 200ms ease-out' }}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          id={DRAWER_ID}
          ref={drawerRef}
          className="absolute inset-y-0 left-0 w-64 border-r"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-1)',
            transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 200ms ease-out',
          }}
        >
          <SidebarContent onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8" inert={drawerOpen}>
        {children}
      </main>
    </div>
  );
}
