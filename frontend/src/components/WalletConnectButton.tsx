import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
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
    if (wallet) {
      try {
        await connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect wallet.');
      }
      return;
    }
    setPickerOpen(true);
  }

  function handleSelect(walletName: (typeof wallets)[number]['adapter']['name']) {
    setPickerOpen(false);
    select(walletName);
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
        <p className="absolute right-0 mt-1 whitespace-nowrap text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      ) : null}
      {pickerOpen ? (
        <div
          className="absolute right-0 z-10 mt-1 rounded-xl border text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          {wallets.map((w) => (
            <button
              key={w.adapter.name}
              type="button"
              onClick={() => handleSelect(w.adapter.name)}
              className="block w-full px-3 py-1.5 text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              {w.adapter.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
