import { connection } from 'next/server';
import { responsesCsv } from '@/lib/server/forms';
import { handle } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET(_request: Request, ctx: RouteContext<'/api/forms/[id]/responses/csv'>) {
  return handle(async () => {
    await connection();
    const { id } = await ctx.params;
    const { csv, filename, title } = responsesCsv(await getStore(), id);
    const utf8Name = encodeURIComponent(`Ответы — ${title}.csv`);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${utf8Name}`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
