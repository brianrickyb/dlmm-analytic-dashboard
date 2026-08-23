import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'

// @solana/web3.js and the wallet-adapter packages reference the Node.js
// global `Buffer` internally; the browser has no such global without this.
// Cast instead of relying on a Window+Buffer type augmentation — that used to
// arrive transitively from @solana/wallet-adapter-wallets, which is gone.
(window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
