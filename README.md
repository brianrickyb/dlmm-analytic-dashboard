# Meridian: DLMM Analytics Dashboard

An analytics dashboard for [Meteora](https://www.meteora.ag/) DLMM (Dynamic Liquidity Market Maker) pools on Solana. It helps liquidity providers compare pools and estimate impermanent loss and net yield before committing capital, alongside a crypto news feed and a long/short positioning screener.

> Actively in development. The pool pages currently run on mock pool data while the on-chain data integration is built.

## Features

- **Pool analytics:** a pool list and per-pool detail pages with TVL, volume, fee APR, and history charts.
- **Impermanent-loss / net-yield calculator:** estimates IL against fee income for a position before you enter it.
- **Crypto news feed:** aggregated from RSS sources, with filters.
- **Long/short + narrative screener:** combines CoinGecko trending data with Bybit positioning stats.
- **Accounts:** Supabase Auth (sign-up, login, protected account routes), verified on the Fastify API by a `requireAuth` middleware.
- **Educational layer:** inline tooltips, a glossary-backed term dictionary, and an FAQ page that explain DeFi/LP concepts for newer users.

## Architecture

```
frontend/   React 19 + TypeScript + Vite, React Router 7, Recharts
backend/    Fastify 5 + TypeScript API: news (RSS), screener (CoinGecko, Bybit), account (Supabase)
db/         schema.sql for Supabase Postgres
docs/       design specs and implementation plans for each feature
```

## Running locally

Requires Node.js 22+ (the backend uses `--env-file-if-exists`) and a Supabase project.

```bash
npm install                      # root (runs both apps together)
npm install --prefix backend
npm install --prefix frontend
cp backend/.env.example backend/.env       # PORT, SUPABASE_URL, SUPABASE_SECRET_KEY
cp frontend/.env.example frontend/.env     # VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                      # starts backend and frontend concurrently
```

Tests run with Vitest in each app:

```bash
npm test --prefix backend
npm test --prefix frontend
```

## Tech stack

React 19 · TypeScript · Vite · React Router 7 · Recharts · Fastify 5 · Node.js · Supabase Auth & Postgres · Vitest · Solana / Meteora DLMM
