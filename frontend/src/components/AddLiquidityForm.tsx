import { useState, type FormEvent } from 'react';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { buildAddLiquidityTx } from '../lib/api/liquidity';
import { usePositionsRefresh } from '../lib/positionsRefresh';
import { PillButton } from './PillButton';

type FlowState = 'idle' | 'building' | 'awaiting-signature' | 'submitting' | 'confirming' | 'success' | 'error';

// `Buffer` is a Node.js global, not available in the browser without a
// polyfill. Transaction.from() accepts a Uint8Array just as well, so decode
// the base64 payload without depending on Buffer at all.
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function AddLiquidityForm() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { bump } = usePositionsRefresh();

  // This form only ever builds transactions against SOLANA_RPC_URL (devnet).
  // The Pools page shows real Meteora pools, but those are mainnet
  // addresses — never valid targets here. The two are intentionally
  // decoupled: this field is manual/editable rather than pre-filled from
  // whichever pool the user is viewing, since auto-filling a real-looking
  // mainnet address would silently fail instead of the current honest
  // "type in a devnet pool address" affordance.
  const [poolAddressInput, setPoolAddressInput] = useState('');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [minBinId, setMinBinId] = useState('');
  const [maxBinId, setMaxBinId] = useState('');
  const [state, setState] = useState<FlowState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  async function runFlow() {
    if (!publicKey || !signTransaction) {
      setErrorMessage('Connect a wallet first.');
      setState('error');
      return;
    }

    setErrorMessage(null);
    setSignature(null);

    try {
      setState('building');
      const built = await buildAddLiquidityTx({
        poolAddress: poolAddressInput,
        amountX,
        amountY,
        minBinId: Number(minBinId),
        maxBinId: Number(maxBinId),
        userPublicKey: publicKey.toBase58(),
      });

      const tx = Transaction.from(base64ToUint8Array(built.transaction));

      setState('awaiting-signature');
      const signedTx = await signTransaction(tx);

      setState('submitting');
      const rawTx = signedTx.serialize();
      const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false, maxRetries: 3 });
      setSignature(sig);

      setState('confirming');
      const confirmation = await connection.confirmTransaction(
        { signature: sig, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error('Transaction failed on-chain.');
      }

      // No backend call needed to record this — the new position now exists
      // on-chain and MyPositionsPage reads directly from the DLMM program via
      // getAllLbPairPositionsByUser. bump() just triggers its refetch.
      setState('success');
      bump();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Add liquidity failed.');
      setState('error');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await runFlow();
  }

  const busy = state === 'building' || state === 'awaiting-signature' || state === 'submitting' || state === 'confirming';

  return (
    <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        Add Liquidity (devnet)
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <input
          type="text"
          required
          placeholder="Pool address (devnet)"
          value={poolAddressInput}
          onChange={(e) => setPoolAddressInput(e.target.value)}
          className="col-span-2 rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          min="0"
          step="1"
          required
          placeholder="Amount X (base units)"
          value={amountX}
          onChange={(e) => setAmountX(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          min="0"
          step="1"
          required
          placeholder="Amount Y (base units)"
          value={amountY}
          onChange={(e) => setAmountY(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          required
          placeholder="Min Bin ID"
          value={minBinId}
          onChange={(e) => setMinBinId(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          required
          placeholder="Max Bin ID"
          value={maxBinId}
          onChange={(e) => setMaxBinId(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <PillButton type="submit" variant="solid" disabled={busy} className="col-span-2 text-sm">
          {busy ? `${state}...` : 'Add Liquidity'}
        </PillButton>
      </form>

      {state === 'error' ? (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--status-critical)' }}>
            {errorMessage}
          </p>
          <PillButton onClick={runFlow} disabled={busy} className="text-xs">
            {busy ? `${state}...` : 'Retry'}
          </PillButton>
        </div>
      ) : null}

      {state === 'success' && signature ? (
        <p className="text-xs" style={{ color: 'var(--status-good)' }}>
          Confirmed —{' '}
          <a href={`https://solscan.io/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            view on Solscan
          </a>
        </p>
      ) : null}
    </div>
  );
}
