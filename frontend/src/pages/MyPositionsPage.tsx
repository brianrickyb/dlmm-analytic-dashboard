import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchPositions } from '../lib/api/positions';
import { usePositionsRefresh } from '../lib/positionsRefresh';
import type { Position } from '../types/liquidity';

export function MyPositionsPage() {
  const { connected, publicKey } = useWallet();
  const { version } = usePositionsRefresh();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [positions, setPositions] = useState<Position[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!connected || !publicKey) return;

    let cancelled = false;
    setStatus('loading');

    fetchPositions(publicKey.toBase58())
      .then((rows) => {
        if (cancelled) return;
        setPositions(rows);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load positions.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, version]);

  if (!connected) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Connect a wallet to see your positions.
      </p>
    );
  }

  if (status === 'loading') {
    return <div className="h-24 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (status === 'error') {
    return (
      <p className="text-sm" style={{ color: 'var(--red)' }}>
        {errorMessage}
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No positions yet.
      </p>
    );
  }

  return (
    <div className="page-enter space-y-3">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        My Positions
      </h1>
      <ul className="space-y-1.5">
        {positions.map((position) => (
          <li key={position.positionAddress} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <p style={{ color: 'var(--text)' }}>Pool: {position.poolAddress}</p>
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Position: {position.positionAddress}</p>
            <a href={`https://solscan.io/account/${position.positionAddress}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
              View on Solscan
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
