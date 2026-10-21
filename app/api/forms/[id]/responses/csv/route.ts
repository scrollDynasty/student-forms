import { connection } from 'next/server';
import { csvTimeZone, responsesCsv } from '@/lib/server/forms';
import { handle } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET(request: Request, ctx: RouteContext<'/api/forms/[id]/responses/csv'>) {
  return handle(async () => {
    await connection();
    const { id } = await ctx.params;
    const timeZone = csvTimeZone(new URL(request.url).searchParams.get('tz'));
    const { csv, filename, title } = responsesCsv(await getStore(), id, timeZone);
    // RFC 5987: encodeURIComponent leaves ' ( ) * unescaped; lone surrogates would throw.
    const utf8Name = encodeURIComponent(`Ответы — ${title.toWellFormed()}.csv`).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${utf8Name}`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
