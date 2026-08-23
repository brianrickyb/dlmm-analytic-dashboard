import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
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
})
