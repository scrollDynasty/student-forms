import { handle, notFound } from '@/lib/server/http';

// Unknown API routes answer with the JSON error format instead of the HTML 404 page.
const notFoundJson = () =>
  handle(async () => {
    throw notFound('Маршрут API не найден');
  });

export { notFoundJson as GET, notFoundJson as POST, notFoundJson as PUT, notFoundJson as PATCH, notFoundJson as DELETE };
