import { setPublished } from '@/lib/server/forms';
import { handle, json } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function POST(_request: Request, ctx: RouteContext<'/api/forms/[id]/unpublish'>) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await setPublished(await getStore(), id, false);
    return json({ form });
  });
}
