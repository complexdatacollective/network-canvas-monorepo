import { testVariableId } from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';

/** The participant's first name, as text names it. */
export const FIRST_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('firstName'),
});

/**
 * A protocol in English and French with one Information stage whose content
 * is `content`, which may show the ego's `firstName` (`FIRST_NAME`). Not
 * parsed, so a test can give it text the schema refuses.
 */
export const dynamicValuesProtocol = (
  content: Record<string, string>,
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: {
    node: {},
    edge: {},
    ego: {
      variables: {
        [testVariableId('firstName')]: { name: 'first_name', type: 'text' },
      },
    },
  },
  stages: [
    {
      id: ProtocolObjectIdSchema.parse('5b0c2a4e-1f7d-4c3a-8e9b-0a1b2c3d4e11'),
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      content,
    },
  ],
});
