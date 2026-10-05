import { resolveAppLocale } from '@codaco/app-i18n/negotiate';
import { frescoLocales } from '~/i18n/locales';

export type FrescoI18nInitialization = Readonly<{
  locale: string;
  preference: string | null;
  userId: string | null;
  requested: readonly string[];
}>;

export function resolveFrescoLocale(input: {
  account: { userId: string; locale: string | null } | null;
  mirror: string | null;
  requested: readonly string[];
}): FrescoI18nInitialization {
  const resolve = (stored: string | null) =>
    resolveAppLocale({
      stored,
      requested: input.requested,
      locales: frescoLocales,
      defaultLocale: 'en',
    });
  // An authenticated account's null is an explicit Automatic choice, not an
  // absent account. It must not revive a previous user's device preference.
  if (input.account?.locale === null) {
    return {
      ...resolve(null),
      preference: null,
      userId: input.account.userId,
      requested: input.requested,
    };
  }
  const account = input.account ? resolve(input.account.locale) : null;
  const resolved =
    account?.source === 'stored' ? account : resolve(input.mirror);
  return {
    locale: resolved.locale,
    preference: resolved.source === 'stored' ? resolved.locale : null,
    userId: input.account?.userId ?? null,
    requested: input.requested,
  };
}
