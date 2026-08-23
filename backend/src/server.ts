import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerNewsRoutes } from './routes/news.js';
import { registerScreenerRoutes } from './routes/screener.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerLiquidityRoutes } from './routes/liquidity.js';
import { registerPositionsRoutes } from './routes/positions.js';
import { registerPoolsRoutes } from './routes/pools.js';
import { registerMarketsRoutes } from './routes/markets.js';
import { createNewsService } from './services/rss.js';

export async function buildServer() {
  const app = Fastify({ logger: true });

  // Dev default reflects any origin. Before exposing this API beyond localhost,
  // set CORS_ALLOWED_ORIGINS to a comma-separated allowlist (e.g. the deployed
  // frontend origin) — @fastify/cors then echoes only those back.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors, { origin: allowedOrigins.length > 0 ? allowedOrigins : true });
  // global: false — only routes that opt in via `config: { rateLimit }`
  // (the RPC-heavy liquidity/positions routes) are limited; everything else
  // is unaffected. MUST be awaited: @fastify/rate-limit hooks into route
  // registration (onRoute) to read each route's `config.rateLimit` — routes
  // added before the plugin finishes loading are silently never rate
  // limited, even though `app.ready()` later resolves without error.
  await app.register(rateLimit, { global: false });

  // Shared between registerNewsRoutes and registerMarketsRoutes so the 6 RSS
  // feeds (including the gold/forex ones only markets.ts needs) are polled
  // once per cache TTL, not twice by two independently-constructed services.
  const newsService = createNewsService();

  app.get('/health', async () => ({ status: 'ok' }));
  registerNewsRoutes(app, { newsService });
  registerScreenerRoutes(app);
  registerAccountRoutes(app);
  registerLiquidityRoutes(app);
  registerPositionsRoutes(app);
  registerPoolsRoutes(app);
  registerMarketsRoutes(app, { newsService });

  return app;
}

async function main() {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 4000);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
