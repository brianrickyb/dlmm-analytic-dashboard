import { type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';

const SOLANA_RPC_URL = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ?? 'https://api.devnet.solana.com';

// No explicit adapter list: Phantom and Solflare both implement the Wallet
// Standard, which wallet-adapter-react detects natively. Importing adapter
// classes from '@solana/wallet-adapter-wallets' instead would drag the whole
// wallets meta-package into the eager bundle (~hundreds of kB) for zero gain.
export function WalletContextProvider({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      {/* wallets=[] still auto-detects installed Wallet-Standard wallets */}
      <WalletProvider wallets={[]} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
