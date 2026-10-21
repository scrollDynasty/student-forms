import { setPublished } from '@/lib/server/forms';
import { assertSameOrigin, handle, json, readOptionalJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function POST(request: Request, ctx: RouteContext<'/api/forms/[id]/publish'>) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const { version } = await readOptionalJsonObject(request);
    const form = await setPublished(await getStore(), id, true, version);
    return json({ form });
  });
}
