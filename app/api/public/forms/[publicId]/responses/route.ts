import { assertPublicFormExists, submitResponse } from '@/lib/server/forms';
import { handle, json, rateLimit, readJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function POST(request: Request, ctx: RouteContext<'/api/public/forms/[publicId]/responses'>) {
  return handle(async () => {
    const { publicId } = await ctx.params;
    const store = await getStore();
    assertPublicFormExists(store, publicId);
    rateLimit(request, `submit:${publicId}`, 60, 600);
    const { status, response } = await submitResponse(store, publicId, await readJsonObject(request));
    return json({ response }, status);
  });
}
