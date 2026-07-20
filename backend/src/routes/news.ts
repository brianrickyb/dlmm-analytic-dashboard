import type { FastifyInstance } from 'fastify';
import {
  createNewsService,
  UpstreamMalformedError,
  UpstreamRejectedError,
  UpstreamUnavailableError,
} from '../services/cryptopanic.js';

export function registerNewsRoutes(app: FastifyInstance, deps: { apiKey?: string }): void {
  const newsService = deps.apiKey ? createNewsService({ apiKey: deps.apiKey }) : null;

  app.get('/api/news', async (request, reply) => {
    if (!newsService) {
      reply.code(500);
      return { error: 'Server is missing CRYPTOPANIC_API_KEY.' };
    }

    const { currencies, filter } = request.query as { currencies?: string; filter?: string };

    try {
      const posts = await newsService.fetchNews({ currencies, filter });
      return { posts };
    } catch (err) {
      if (err instanceof UpstreamUnavailableError) {
        reply.code(503);
        return { error: 'News provider is unavailable right now.' };
      }
      if (err instanceof UpstreamRejectedError || err instanceof UpstreamMalformedError) {
        reply.code(502);
        return { error: 'News provider returned an unexpected response.' };
      }
      throw err;
    }
  });
}
