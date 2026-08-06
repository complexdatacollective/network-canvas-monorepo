// DIAG
import { redirect } from '@tanstack/react-router';

import { env } from '~/env';
import { UNCONFIGURED_TIMEOUT } from '~/fresco.config';
import { prisma } from '~/lib/db';
import {
  type AppSetting,
  type AppSettingValues,
  appSettingPreprocessedSchema,
} from '~/schemas/appSettings';

/**
 * The TanStack Start replacement for `queries/appSettings.ts`.
 *
 * `vite.config.ts` aliases `~/queries/appSettings` to this module for the Start
 * build. The alias, rather than an import rewrite, is deliberate: `queries/`
 * cannot be ported — every function in it is a `'use cache'` function and there
 * is no server-cache primitive in Start — so the whole layer is *replaced*, and
 * the call sites in `lib/` stay untouched and shared between both trees.
 *
 * The chosen replacement is option (i): no server cache. Each call is a plain
 * Prisma read. `safeCacheTag`, `cacheLife` and `connection` all disappear;
 * there is nothing left to tag, nothing to keep alive, and nothing to opt out
 * of prerendering because nothing is prerendered.
 *
 * The exported signatures match the Next.js module exactly, so `tsc` — which
 * resolves the real module — is checking the same contract the alias supplies.
 */

async function getAppSettingRaw(key: AppSetting): Promise<string | null> {
  const result = await prisma.appSettings.findUnique({ where: { key } });
  return result?.value ?? null;
}

export async function getAppSetting<Key extends AppSetting>(
  key: Key,
): Promise<AppSettingValues[Key]> {
  const rawValue = await getAppSettingRaw(key);

  // Convert null to undefined so schema defaults work correctly
  const parsedValue = appSettingPreprocessedSchema.shape[key].parse(
    rawValue ?? undefined,
  );

  return parsedValue as AppSettingValues[Key];
}

export async function requireAppNotExpired(isSetupRoute = false) {
  const [isConfigured, initializedAt] = await Promise.all([
    getAppSetting('configured'),
    getAppSetting('initializedAt'),
  ]);

  const expired =
    !isConfigured &&
    initializedAt !== null &&
    initializedAt.getTime() < Date.now() - UNCONFIGURED_TIMEOUT;

  if (expired) {
    // `href` rather than `to`: /expired and /setup are real Fresco URLs but are
    // not in the Phase B slice, so the router's typed route union does not
    // contain them yet. Using `to` would be a compile error — which is the
    // router correctly reporting that the slice is partial. These two are the
    // only places that is silenced, and both revert to `to` once
    // `(blobs)` lands.
    throw redirect({ href: '/expired' });
  }

  if (isSetupRoute) {
    return;
  }

  if (!isConfigured) {
    throw redirect({ href: '/setup' });
  }

  return;
}

export async function requireAppNotConfigured() {
  // Allow visiting /setup in development even after configuration
  if (env.NODE_ENV === 'development') {
    return;
  }

  const configured = await getAppSetting('configured');

  if (configured) {
    throw redirect({ to: '/' });
  }

  return;
}

export async function isAppConfigured(): Promise<boolean> {
  return await getAppSetting('configured');
}

export async function getInstallationId() {
  if (env.INSTALLATION_ID) {
    return env.INSTALLATION_ID;
  }

  return getAppSetting('installationId');
}

export async function getDisableAnalytics() {
  if (env.DISABLE_ANALYTICS) {
    return env.DISABLE_ANALYTICS;
  }

  return getAppSetting('disableAnalytics');
}
