import { NextResponse, type NextRequest } from 'next/server';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { parseAcceptLanguage } from '@codaco/protocol-validation';
import { frescoTimeZone, localeMirrorCookie } from '~/i18n/locales';
import { proxyMessages } from '~/i18n/proxyMessages';
import { resolveFrescoLocale } from '~/i18n/resolve';
import { frescoCatalogs } from '~/src/locales/catalogs';

/**
 * Next.js dispatches a Server Action by the function a request names,
 * independent of the URL it is sent to and of whether that URL matches any
 * route at all — a request for a path nobody defined still reaches the
 * dispatcher, it just fails to find the action afterwards. So an
 * institutional reverse proxy that restricts researcher paths and leaves
 * everything else open does not by itself stop a request carrying a valid
 * session cookie and an action id lifted from the public `/_next/` bundle
 * from reaching a researcher-only action (export, deletion, settings)
 * through any path the proxy does not happen to block, known or not.
 *
 * A blocklist of "public" paths can therefore never be complete — it would
 * have to enumerate every path nobody has thought to restrict, including
 * every typo, removed route, and future addition. This is an allowlist
 * instead: only the pages that `server-reference-manifest.json` (checked
 * with `pnpm build`) actually shows binding a Server Action get to receive
 * one; every other path, whatever it is, is refused. `/reset` is a GET-only
 * route handler with no bound action, so it is deliberately left out.
 */
const RESEARCHER_ACTION_PATHS: readonly RegExp[] = [
  /^\/signin(?:\/|$)/,
  /^\/setup(?:\/|$)/,
  /^\/expired(?:\/|$)/,
  /^\/dashboard(?:\/|$)/,
];

export function isResearcherActionPath(pathname: string): boolean {
  return RESEARCHER_ACTION_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * Mirrors Next's own `isPossibleServerAction` (server-action-request-meta.ts):
 * a POST names an action either through the `Next-Action` header (the
 * fetch-based path React's client runtime uses) or, for a plain HTML
 * `<form action={serverAction}>` submitted without JavaScript, through a
 * `multipart/form-data` (or `application/x-www-form-urlencoded`) body naming
 * the action in a `$ACTION_ID_<id>` field instead of a header. A guard that
 * only checked the header would let that second form through untouched.
 */
export function isPossibleServerActionRequest(request: NextRequest): boolean {
  if (request.method !== 'POST') {
    return false;
  }
  if (request.headers.has('next-action')) {
    return true;
  }
  const contentType = request.headers.get('content-type');
  return (
    contentType?.startsWith('multipart/form-data') === true ||
    contentType === 'application/x-www-form-urlencoded'
  );
}

export async function proxy(request: NextRequest) {
  if (!isPossibleServerActionRequest(request)) {
    return NextResponse.next();
  }

  if (isResearcherActionPath(request.nextUrl.pathname)) {
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
