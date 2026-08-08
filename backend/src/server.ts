import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerNewsRoutes } from './routes/news.js';
import { registerScreenerRoutes } from './routes/screener.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerLiquidityRoutes } from './routes/liquidity.js';
import { registerPositionsRoutes } from './routes/positions.js';

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  // global: false — only routes that opt in via `config: { rateLimit }`
  // (the RPC-heavy liquidity/positions routes) are limited; everything else
  // is unaffected. MUST be awaited: @fastify/rate-limit hooks into route
  // registration (onRoute) to read each route's `config.rateLimit` — routes
  // added before the plugin finishes loading are silently never rate
  // limited, even though `app.ready()` later resolves without error.
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ status: 'ok' }));
  registerNewsRoutes(app);
  registerScreenerRoutes(app);
  registerAccountRoutes(app);
  registerLiquidityRoutes(app);
  registerPositionsRoutes(app);

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
