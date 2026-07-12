import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';

import { routing } from '~/lib/i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/download.html') {
    const normalizedUrl = request.nextUrl.clone();
    normalizedUrl.pathname = '/download';

    return handleI18nRouting(
      new NextRequest(normalizedUrl, { headers: request.headers }),
    );
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: ['/download.html', '/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
