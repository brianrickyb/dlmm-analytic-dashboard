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
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Connect a wallet to see your positions.
      </p>
    );
  }

  if (status === 'loading') {
    return (
      <div className="h-24 animate-pulse rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
    );
  }

  if (status === 'error') {
    return (
      <p className="text-sm" style={{ color: 'var(--status-critical)' }}>
        {errorMessage}
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No positions yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        My Positions
      </h1>
      <ul className="space-y-2">
        {positions.map((position) => (
          <li
            key={position.id}
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            <p style={{ color: 'var(--text-primary)' }}>Pool: {position.poolAddress}</p>
            <p style={{ color: 'var(--text-muted)' }}>{new Date(position.createdAt).toLocaleString()}</p>
            <a
              href={`https://solscan.io/tx/${position.txSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--series-blue)' }}
            >
              View on Solscan
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
