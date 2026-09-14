import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerNewsRoutes } from './routes/news.js';
import { registerScreenerRoutes } from './routes/screener.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerLiquidityRoutes } from './routes/liquidity.js';
import { registerPositionsRoutes } from './routes/positions.js';
import { registerPoolsRoutes } from './routes/pools.js';
import { registerMarketsRoutes } from './routes/markets.js';
import { createNewsService } from './services/rss.js';

// Maximum JSON body size — prevents memory-exhaustion attacks via oversized payloads.
const MAX_BODY_SIZE = 1_048_576; // 1 MB

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: MAX_BODY_SIZE,
    trustProxy: true,
  });

  // --- Security headers ---
  // Strict CSP, HSTS, X-Frame-Options: DENY, etc. Applied to every response.
  // 'unsafe-inline' is needed for the Vite dev inject; in production the
  // built HTML has nonces or hashes — adjust when deploying.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://s3.tradingview.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'https://s3.tradingview.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://query1.finance.yahoo.com', 'https://api.stlouisfed.org', 'https://cryptopanic.com'],
        frameSrc: ["'self'", 'https://s3.tradingview.com', 'https://www.tradingview.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // TradingView widget needs cross-origin embed
    crossOriginResourcePolicy: false,
  });

  // --- CORS ---
  // Dev default reflects any origin. Before exposing this API beyond localhost,
  // set CORS_ALLOWED_ORIGINS to a comma-separated allowlist (e.g. the deployed
  // frontend origin) — @fastify/cors then echoes only those back.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Preflight cache: 24h
  });

  // --- Rate limiting ---
  // Global default: 60 req/min per IP. Route-specific overrides tighten further
  // for RPC-heavy or upstream-hitting endpoints.
  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
    // Scope by IP, with X-Forwarded-For support when behind a reverse proxy.
    keyGenerator: (request) => {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
      return request.ip;
    },
    // Standard rate-limit headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset).
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
  });

  // --- Request sanitization middleware ---
  // Strip null bytes and overly long strings from path params and query strings
  // to neutralize injection and log-flooding attempts.
  app.addHook('onRequest', async (request) => {
    if (request.params && typeof request.params === 'object') {
      for (const [key, val] of Object.entries(request.params as Record<string, unknown>)) {
        if (typeof val === 'string') {
          // Null-byte removal + length cap (1 KB is generous for any slug/param)
          (request.params as Record<string, string>)[key] = val.replace(/\0/g, '').slice(0, 1024);
        }
      }
    }
    if (request.query && typeof request.query === 'object') {
      for (const [key, val] of Object.entries(request.query as Record<string, unknown>)) {
        if (typeof val === 'string') {
          (request.query as Record<string, string>)[key] = val.replace(/\0/g, '').slice(0, 2048);
        }
      }
    }
  });

  // Shared between registerNewsRoutes and registerMarketsRoutes so the 6 RSS
  // feeds (including the gold/forex ones only markets.ts needs) are polled
  // once per cache TTL, not twice by two independently-constructed services.
  const newsService = createNewsService();

  // --- Routes ---
  app.get('/health', async () => ({ status: 'ok' }));
  registerNewsRoutes(app, { newsService });
  registerScreenerRoutes(app);
  registerAccountRoutes(app);
  registerLiquidityRoutes(app);
  registerPositionsRoutes(app);
  registerPoolsRoutes(app);
  registerMarketsRoutes(app, { newsService });

  // --- 404 catch-all ---
  // Prevents path-probing from leaking Fastify's default 404 HTML with stack traces.
  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return { error: 'Not found.' };
  });

  // --- Error handler ---
  // Catches any unhandled throw and returns a safe JSON response without leaking internals.
  app.setErrorHandler(async (error: Error & { statusCode?: number }, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500);
    return { error: 'Internal server error.' };
  });

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
