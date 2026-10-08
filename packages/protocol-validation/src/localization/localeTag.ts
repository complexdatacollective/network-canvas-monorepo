/**
 * A BCP 47 language tag in the canonical form `Intl.getCanonicalLocales`
 * produces (`en-US`, `zh-Hant-TW`). It is a plain string so that
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

/**
 * Whether a tag is the "undetermined" language (`und`, in any case or with
 * subtags, such as `und-Latn`): the tag BCP 47 reserves for text whose
 * language is not known. A protocol is always written in a real language, so
 * it is never one a protocol declares or keys text by.
 */
export function isUndeterminedLocale(value: string): boolean {
  return value.split('-')[0]?.toLowerCase() === 'und';
}

export function isCanonicalLocale(value: string): boolean {
  return canonicalizeLocale(value) === value;
}
