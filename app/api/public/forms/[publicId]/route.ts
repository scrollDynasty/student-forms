import { connection } from 'next/server';
import { getPublicForm } from '@/lib/server/forms';
import { handle, json } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET(_request: Request, ctx: RouteContext<'/api/public/forms/[publicId]'>) {
  return handle(async () => {
    await connection();
    const { publicId } = await ctx.params;
    return json({ form: getPublicForm(await getStore(), publicId) });
  });
}
