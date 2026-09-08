import { NextResponse, type NextRequest } from 'next/server';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { parseAcceptLanguage } from '@codaco/protocol-validation';
import { frescoTimeZone, localeMirrorCookie } from '~/i18n/locales';
import { proxyMessages } from '~/i18n/proxyMessages';
import { resolveFrescoLocale } from '~/i18n/resolve';
import { frescoCatalogs } from '~/src/locales/catalogs';

/**
 * Next.js dispatches a Server Action by the function its `Next-Action` header
 * names, independent of the URL the request is sent to — so an institutional
 * reverse proxy that restricts researcher paths and leaves these public ones
 * open does not by itself stop a request carrying a valid session cookie and
 * an action ID lifted from the public `/_next/` bundle from reaching a
 * researcher-only action (export, deletion, settings) through one of these
 * routes. None of them binds a Server Action today, so a request naming one
 * here is never legitimate traffic and is refused outright.
 */
const PUBLIC_PARTICIPANT_PATHS: readonly RegExp[] = [
  /^\/interview\//,
  /^\/onboard\//,
  /^\/api\/assets\//,
  /^\/api\/uploadthing(?:\/|$)/,
  /^\/api\/health(?:\/|$)/,
  /^\/api\/interviews\/[^/]+\/finish\/?$/,
];

export function isPublicParticipantPath(pathname: string): boolean {
  return PUBLIC_PARTICIPANT_PATHS.some((pattern) => pattern.test(pathname));
}

export async function proxy(request: NextRequest) {
  if (!request.headers.has('next-action')) {
    return NextResponse.next();
  }

  if (!isPublicParticipantPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const { locale } = resolveFrescoLocale({
    account: null,
    mirror: request.cookies.get(localeMirrorCookie)?.value ?? null,
    requested: parseAcceptLanguage(request.headers.get('accept-language')),
  });
  const intl = createAppIntl({
    locale,
    messages: frescoCatalogs[locale],
    timeZone: frescoTimeZone,
  });

  return NextResponse.json(
    { error: intl.formatMessage(proxyMessages.copyServerActionRefused) },
    { status: 403 },
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
