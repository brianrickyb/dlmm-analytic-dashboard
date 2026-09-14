import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { WalletConnectButton } from './WalletConnectButton';

const NAV_LINKS: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Pools',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/news',
    label: 'News',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2M18 14h-8M15 18h-5M10 6h8v4h-8V6z" />
      </svg>
    ),
  },
  {
    to: '/screener',
    label: 'Screener',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
  },
  {
    to: '/markets/xau',
    label: 'Forex & Gold',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><ellipse cx="12" cy="12" rx="4.5" ry="10" /><path d="M2 12h20" />
      </svg>
    ),
  },
  {
    to: '/faq',
    label: 'FAQ',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
      </svg>
    ),
  },
  {
    to: '/positions',
    label: 'My Positions',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
      </svg>
    ),
  },
];

const DRAWER_ID = 'mobile-nav-drawer';
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SidebarLink({
  to,
  label,
  icon,
  onNavigate,
  truncate = false,
}: {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
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
      className={`relative flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? 'font-semibold' : 'font-normal'}`}
      style={{
        background: active ? 'var(--green-subtle)' : 'transparent',
        color: active ? 'var(--green)' : 'var(--muted)',
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-sm"
          style={{ background: 'var(--green)' }}
        />
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className={`min-w-0 flex-1 ${truncate ? 'truncate' : ''}`}>{label}</span>
    </Link>
  );
}

function Wordmark() {
  return (
    <>
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sm font-extrabold"
        style={{ background: 'linear-gradient(135deg, var(--green) 0%, var(--green-gradient-end) 100%)', color: 'var(--green-fg)', fontFamily: 'var(--font-mono)' }}
      >
        M
      </span>
      <div>
        <div className="text-xs font-bold leading-tight" style={{ color: 'var(--text)' }}>
          Meridian
        </div>
        <div className="text-[10px] leading-tight" style={{ color: 'var(--muted)' }}>
          DeFi &middot; Crypto &middot; FX
        </div>
      </div>
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { session } = useAuth();

  return (
    <div className="flex h-full flex-col p-4">
      <Link to="/" onClick={onNavigate} className="mb-4 flex items-center gap-2.5">
        <Wordmark />
      </Link>
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: 'var(--green)', animation: 'pulse-dot 2s infinite' }}
        />
        <span className="text-[10px] tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          LIVE &middot; mainnet-beta
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_LINKS.map((link) => (
          <SidebarLink key={link.to} to={link.to} label={link.label} icon={link.icon} onNavigate={onNavigate} />
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
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <SidebarContent onNavigate={() => {}} />
      </aside>

      <header
        className="flex items-center justify-between border-b px-4 py-3 md:hidden"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
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
          <span className="h-0.5 w-5" style={{ background: 'var(--text)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text)' }} />
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
            background: 'var(--surface)',
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
