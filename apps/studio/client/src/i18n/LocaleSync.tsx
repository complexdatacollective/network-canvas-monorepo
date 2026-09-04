import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { orpc } from '../lib/api.ts';
import { sessionQueryOptions } from '../lib/session.ts';
import { useStudioLocale } from './StudioI18nProvider.tsx';

/**
 * Applies the server-stored UI-language preference once identity loads
 * (2026-09-04 localization design §5.1). A leaf subscriber to the shared `me`
 * query, so the layouts that mount it keep holding no identity themselves.
 *
 * Server wins over the device mirror: a differing stored preference is
 * applied and mirrored, and a `null` preference reverts the device to browser
 * negotiation. The one thing it must not do is clobber a fresher local choice
 * the server has not acknowledged yet — `applyServerPreference` carries that
 * guard, which is why the account is passed alongside the locale: an
 * unacknowledged write belongs to the researcher who made it, and must not
 * answer for whoever signs in next.
 *
 * **Mounted at the root, not in the app shell.** `/no-team` lives in the
 * focused branch, a sibling of `AppLayout`, and it is somewhere a researcher
 * with no team can spend their entire visit. Mounted only in the app shell
 * this never ran there, so an account preference set on another device was
 * silently ignored for that whole visit. The root is the one place that sits
 * above all four shells, which is the same reason the provider itself is
 * there.
 *
 * Being at the root means it also renders for visitors who are signed out, so
 * `me` is asked for only once the session says there is somebody to ask
 * about — a public page must not carry a failing identity request.
 */
export default function LocaleSync() {
  const { applyServerPreference } = useStudioLocale();
  const session = useQuery(sessionQueryOptions);
  const me = useQuery({
    ...orpc.me.queryOptions(),
    enabled: session.data === 'signedIn',
  });
  const userId = me.data?.userId;
  const serverLocale = me.data?.locale ?? null;

  useEffect(() => {
    if (userId === undefined) return;
    applyServerPreference(serverLocale, userId);
  }, [userId, serverLocale, applyServerPreference]);

  return null;
}
