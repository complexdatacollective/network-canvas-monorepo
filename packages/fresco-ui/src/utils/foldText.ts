const DIACRITIC = /\p{Diacritic}/gu;

/**
 * Folds text for case- and accent-insensitive comparison: "Localización"
 * and "localizacion" fold to the same string.
 */
export function foldText(value: string, locale?: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITIC, '')
    .toLocaleLowerCase(locale);
}
