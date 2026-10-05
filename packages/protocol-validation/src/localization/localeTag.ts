/**
 * A BCP 47 language tag in the canonical form `Intl.getCanonicalLocales`
 * produces (`en-US`, `zh-Hant-TW`, `und`). It is a plain string so that
 * schema-inferred types and caller-supplied tags interoperate; canonical form
 * is guaranteed by validation, not by the type.
 */
export type LocaleTag = string;

export type LocalizationDeclaration = Readonly<{
  defaultLocale: LocaleTag;
  locales: readonly LocaleTag[];
}>;

export function canonicalizeLocale(value: string): LocaleTag | undefined {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

export function isCanonicalLocale(value: string): boolean {
  return canonicalizeLocale(value) === value;
}
