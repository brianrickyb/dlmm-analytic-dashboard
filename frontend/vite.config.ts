import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Target modern browsers only — avoids shipping polyfills for dead platforms.
    target: 'es2022',
    // Disable source maps in production — prevents source-code leakage from
    // the deployed bundle. Source maps are still available in dev mode.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vendor splitting: app code changes on every deploy, these stacks rarely
        // do — separate chunks mean returning users re-download only what changed.
        // Also keeps every chunk under Vite's 500 kB warning threshold instead of
        // one monolithic eager bundle.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@solana') || id.includes('buffer')) return 'vendor-solana';
          if (id.includes('@supabase')) return 'vendor-supabase';
          // recharts pulls the d3 stack with it — big enough to warrant its own chunk
          if (id.includes('recharts') || id.includes('victory-vendor') || id.includes('/d3-')) return 'vendor-recharts';
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('scheduler')) return 'vendor-react';
          return 'vendor-misc';
        },
      },
    },
  },
  server: {
    // Restrict the dev server to localhost only — never expose to 0.0.0.0.
    host: '127.0.0.1',
    // Security headers for the Vite dev server responses.
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
  preview: {
    // Same restrictions for `vite preview` (production-like local server).
    host: '127.0.0.1',
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
})
