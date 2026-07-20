import type { FastifyInstance } from 'fastify';
import { createNewsService, AllFeedsUnavailableError, type NewsPost, type NewsQuery } from '../services/rss.js';

interface NewsServiceLike {
  fetchNews(query: NewsQuery): Promise<NewsPost[]>;
}

export function registerNewsRoutes(app: FastifyInstance, deps: { newsService?: NewsServiceLike } = {}): void {
  const newsService = deps.newsService ?? createNewsService();

  app.get('/api/news', async (request, reply) => {
    const { currencies, source } = request.query as { currencies?: string; source?: string };

    try {
      const posts = await newsService.fetchNews({ currencies, source });
      return { posts };
    } catch (err) {
      if (err instanceof AllFeedsUnavailableError) {
        reply.code(503);
        return { error: 'News feeds are unavailable right now.' };
      }
      throw err;
    }
  });
}
