import { recordEvent } from '@/lib/server/forms';
import { handle, noContent, rateLimit, readJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function POST(request: Request, ctx: RouteContext<'/api/public/forms/[publicId]/events'>) {
  return handle(async () => {
    const { publicId } = await ctx.params;
    rateLimit(request, `events:${publicId}`, 600, 6000);
    await recordEvent(await getStore(), publicId, await readJsonObject(request));
    return noContent();
  });
}
