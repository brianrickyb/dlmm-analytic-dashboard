import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { PillButton } from './PillButton';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { wallets, wallet, select, connect, disconnect, connecting, connected, publicKey } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  async function handleConnectClick() {
    setError(null);
    const walletReady = wallet && (wallet.readyState === WalletReadyState.Installed || wallet.readyState === WalletReadyState.Loadable);
    if (walletReady) {
      try {
        await connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect wallet.');
      }
      return;
    }
    setPickerOpen(true);
  }

  function handleSelect(w: (typeof wallets)[number]) {
    // Selecting a wallet whose extension isn't installed would trigger the
    // adapter's own connect() flow, which redirects the whole tab to the
    // wallet's install page unprompted. Only ever select wallets we can
    // actually connect to; uninstalled wallets get an explicit, user-chosen
    // "Install" link in the picker instead (see render below).
    if (w.readyState !== WalletReadyState.Installed && w.readyState !== WalletReadyState.Loadable) return;
    setPickerOpen(false);
    select(w.adapter.name);
  }

  if (connected && publicKey) {
    return (
      <PillButton onClick={() => disconnect()} className="text-xs">
        {shortenAddress(publicKey.toBase58())}
      </PillButton>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <PillButton variant="solid" onClick={handleConnectClick} disabled={connecting} className="text-sm">
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </PillButton>
      {error ? (
        <p className="absolute bottom-full left-0 mb-1 whitespace-nowrap text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      ) : null}
      {pickerOpen ? (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 rounded-xl border text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          {wallets.map((w) => {
            const installed = w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable;
            return installed ? (
              <button
                key={w.adapter.name}
                type="button"
                onClick={() => handleSelect(w)}
                className="block w-full px-3 py-1.5 text-left"
                style={{ color: 'var(--text-primary)' }}
              >
                {w.adapter.name}
              </button>
            ) : (
              <a
                key={w.adapter.name}
                href={w.adapter.url}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>{w.adapter.name}</span>
                <span className="text-xs">Install ↗</span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
