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

/**
 * Orders tags by their characters, which no runtime's locale data can change.
 * A protocol's languages have no order of their own, so wherever one has to be
 * picked from several, or their order could leak into a result, it is this.
 */
export function compareLocaleTags(a: LocaleTag, b: LocaleTag): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isCanonicalLocale(value: string): boolean {
  return canonicalizeLocale(value) === value;
}
