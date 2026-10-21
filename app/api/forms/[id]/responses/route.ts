import { connection } from 'next/server';
import { listResponses } from '@/lib/server/forms';
import { handle, json } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET(_request: Request, ctx: RouteContext<'/api/forms/[id]/responses'>) {
  return handle(async () => {
    await connection();
    const { id } = await ctx.params;
    return json(listResponses(await getStore(), id));
  });
}
