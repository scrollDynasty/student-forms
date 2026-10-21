import { setPublished } from '@/lib/server/forms';
import { assertSameOrigin, handle, json } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function POST(request: Request, ctx: RouteContext<'/api/forms/[id]/unpublish'>) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const form = await setPublished(await getStore(), id, false);
    return json({ form });
  });
}
