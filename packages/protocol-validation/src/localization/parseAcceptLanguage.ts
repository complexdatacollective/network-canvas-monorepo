/**
 * Parse HTTP language preferences (RFC 9110 sections 12.4.2 and 12.5.4).
 * Return canonical BCP 47 tags in descending quality order, retaining input
 * order for ties and the highest-quality occurrence of duplicate tags.
 * Invalid entries, zero-quality exclusions, and the unspecific wildcard
 * contribute no preference. Hosts pass the result to their locale matcher.
 * This helper performs no I/O and does not select or mutate a protocol locale.
 */
export function parseAcceptLanguage(header: string | null): readonly string[] {
  if (header === null) return [];

  const preferences: { locale: string; quality: number }[] = [];
  for (const entry of header.split(',')) {
    // Quality values have at most three fractional digits. Unknown or repeated
    // parameters invalidate this entry rather than silently giving it q=1.
    const match =
      /^[ \t]*([a-z][a-z0-9-]*)[ \t]*(?:;[ \t]*q[ \t]*=[ \t]*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)[ \t]*)?$/i.exec(
        entry,
      );
    if (!match?.[1]) continue;
    const quality = match[2] === undefined ? 1 : Number(match[2]);
    if (quality === 0) continue;
    try {
      const locale = Intl.getCanonicalLocales(match[1])[0];
      if (locale !== undefined) preferences.push({ locale, quality });
    } catch {
      // Uncontrolled HTTP input can contain an invalid tag among valid ones.
    }
  }

  return [
    ...new Set(
      preferences
        .toSorted((a, b) => b.quality - a.quality)
        .map(({ locale }) => locale),
    ),
  ];
}
