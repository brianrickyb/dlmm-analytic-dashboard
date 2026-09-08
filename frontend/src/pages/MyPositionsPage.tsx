import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchPositions, fetchPositionCostBasis } from '../lib/api/positions';
import { usePositionsRefresh } from '../lib/positionsRefresh';
import { computePositionPnl } from '../lib/positionPnl';
import { formatPercent, formatPrice } from '../lib/format';
import { Result } from '../components/IlCalculator';
import type { Position, PositionCostBasis } from '../types/liquidity';

type PnlState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; costBasis: PositionCostBasis };

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
      <ul className="space-y-3">
        {positions.map((position) => (
          <PositionRow key={position.positionAddress} position={position} />
        ))}
      </ul>
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const [pnl, setPnl] = useState<PnlState>({ status: 'idle' });

  function handleShowPnl() {
    setPnl({ status: 'loading' });
    fetchPositionCostBasis(position.positionAddress, position.poolAddress)
      .then((res) => {
        if (res.available && res.costBasis) {
          setPnl({ status: 'ready', costBasis: res.costBasis });
        } else {
          setPnl({ status: 'unavailable' });
        }
      })
      .catch((err: unknown) => {
        setPnl({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load P&L.' });
      });
  }

  const computedPnl = pnl.status === 'ready' ? computePositionPnl(position, pnl.costBasis) : null;

  return (
    <li className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <p style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>Pool: {position.poolAddress}</p>
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Position: {position.positionAddress}</p>
      <a href={`https://solscan.io/account/${position.positionAddress}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
        View on Solscan
      </a>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Result label="Bin range" value={`${position.lowerBinId} .. ${position.upperBinId}`} />
        <Result label="Active bin" value={String(position.activeBinId)} />
        <Result label="Liquidity value" value={`${position.liquidity.valueInQuote.toFixed(4)} (quote)`} accent="var(--green)" />
        <Result label="Fees earned" value={`${position.fees.valueInQuote.toFixed(6)} (quote)`} accent="var(--green)" />
      </div>

      {pnl.status === 'idle' && (
        <button
          onClick={handleShowPnl}
          className="mt-3 rounded border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          Show P&L
        </button>
      )}
      {pnl.status === 'loading' && (
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          Loading P&L…
        </p>
      )}
      {pnl.status === 'unavailable' && (
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          P&L unavailable for this position (entry price could not be resolved).
        </p>
      )}
      {pnl.status === 'error' && (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs" style={{ color: 'var(--red)' }}>
            {pnl.message}
          </p>
          <button
            onClick={() => setPnl({ status: 'idle' })}
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            Retry
          </button>
        </div>
      )}
      {pnl.status === 'ready' && computedPnl && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Result label="Entry price" value={formatPrice(pnl.costBasis.entryPrice)} />
          <Result label="Impermanent loss" value={formatPercent(computedPnl.impermanentLossPct)} accent="var(--red)" />
          <Result
            label="Net yield"
            value={`${computedPnl.netYieldQuote.toFixed(6)} (${formatPercent(computedPnl.netYieldPct)})`}
            accent={computedPnl.netYieldQuote >= 0 ? 'var(--green)' : 'var(--red)'}
          />
        </div>
      )}
    </li>
  );
}
