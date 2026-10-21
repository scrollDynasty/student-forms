import { connection } from 'next/server';
import { getAnalytics } from '@/lib/server/forms';
import { handle, json } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET(_request: Request, ctx: RouteContext<'/api/forms/[id]/analytics'>) {
  return handle(async () => {
    await connection();
    const { id } = await ctx.params;
    return json(getAnalytics(await getStore(), id));
  });
}
