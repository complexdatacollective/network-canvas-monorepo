import {
  createDefaultFinishSessionStage,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

const LOCALES = ['en', 'fr', 'es', 'de'] as const;

/**
 * Whether stage `index` has a translation into `locale`: French has most
 * texts, Spanish about half and German a quarter, so every filter has rows to
 * show and rows to leave out.
 */
const translatedInto = (locale: string, index: number) => {
  switch (locale) {
    case 'fr':
      return index % 4 !== 3;
    case 'es':
      return index % 2 === 0;
    case 'de':
      return index % 4 === 0;
    default:
      return true;
  }
};

const translations = (index: number, make: (locale: string) => string) =>
  Object.fromEntries(
    LOCALES.filter((locale) => translatedInto(locale, index)).map((locale) => [
      locale,
      make(locale),
    ]),
  );

/**
 * A protocol with `stages` Information stages in four languages, each stage
 * holding a name, a heading and two formatted texts, so the translation table
 * has four rows per stage and the interview's own words besides. Generated
 * rather than stored, so a test can ask for the size it needs.
 */
export const largeTranslationProtocol = (stages: number): CurrentProtocol => {
  const localization = { defaultLocale: 'en', locales: [...LOCALES] };
  return {
    name: 'Large study',
    schemaVersion: 9,
    localization,
    assetManifest: {},
    codebook: { node: {}, edge: {}, ego: {} },
    stages: [
      ...Array.from({ length: stages }, (_, index) => ({
        id: `stage-${index}`,
        type: 'Information' as const,
        label: translations(index, (locale) => `Section ${index} ${locale}`),
        title: translations(index, (locale) => `Heading ${index} ${locale}`),
        items: [0, 1].map((item) => ({
          id: `stage-${index}-text-${item}`,
          type: 'text' as const,
          content: translations(
            index,
            (locale) =>
              `Paragraph ${item} of **section ${index}** in ${locale}, which is long enough to wrap onto a second line in a narrow column of the table.`,
          ),
        })),
      })),
      createDefaultFinishSessionStage({ id: 'finish', localization }),
    ],
  };
};
