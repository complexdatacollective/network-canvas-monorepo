import type { CurrentProtocol } from '@codaco/protocol-validation';

type Stage = CurrentProtocol['stages'][number];

/**
 * A protocol in English and French with one Information stage whose content
 * is `content`. The stage binds `dynamicValues`, each of which may read
 * the ego's `firstName`. Not parsed, so a test can give it text the schema
 * refuses.
 */
export const dynamicValuesProtocol = (
  content: Record<string, string>,
  dynamicValues?: Stage['dynamicValues'],
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: {
    node: {},
    edge: {},
    ego: { variables: { firstName: { name: 'first_name', type: 'text' } } },
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      content,
      ...(dynamicValues === undefined ? {} : { dynamicValues }),
    },
  ],
});
