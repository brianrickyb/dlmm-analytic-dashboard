import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerNewsRoutes } from './routes/news.js';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok' }));
  registerNewsRoutes(app);

  return app;
}

async function main() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 4000);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
