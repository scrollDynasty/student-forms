import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedHost } from '@/lib/server/host';

// Runs before the admin pages and the admin API (see config.matcher); the public form is open to any host.
export function proxy(request: NextRequest) {
  if (isAllowedHost(request.headers.get('host'))) return NextResponse.next();
  const message = 'Неизвестный адрес сервера. Добавьте его в переменную окружения ALLOWED_HOSTS.';
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN_HOST', message } }, { status: 403 });
  }
  return new NextResponse(message, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/forms', '/api/forms/:path*'],
};
