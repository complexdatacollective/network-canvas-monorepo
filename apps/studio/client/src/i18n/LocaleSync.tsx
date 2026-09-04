import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { orpc } from '../lib/api.ts';
import { useStudioLocale } from './StudioI18nProvider.tsx';

/**
 * Applies the server-stored UI-language preference once identity loads
 * (2026-09-04 localization design §5.1). A leaf subscriber to the shared `me`
 * query, mounted inside the signed-in shell the way `EntityLockup` is, so
 * `AppLayout` itself keeps holding no identity.
 *
 * Server wins over the device mirror: a differing stored preference is
 * applied and mirrored, and a `null` preference reverts the device to browser
 * negotiation. The one thing it must not do is clobber a fresher local choice
 * the server has not acknowledged yet — `applyServerPreference` carries that
 * guard.
 */
export default function LocaleSync() {
  const { applyServerPreference } = useStudioLocale();
  const me = useQuery(orpc.me.queryOptions());
  const hasAnswer = me.data !== undefined;
  const serverLocale = me.data?.locale ?? null;

  useEffect(() => {
    if (!hasAnswer) return;
    applyServerPreference(serverLocale);
  }, [hasAnswer, serverLocale, applyServerPreference]);

  return null;
}
