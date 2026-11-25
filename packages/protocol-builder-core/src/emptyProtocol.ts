import {
  createDefaultFinishSessionStage,
  createProtocolObjectId,
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

// Until a host asks the researcher for a language, a new protocol declares
// English, as a protocol migrated from schema 8 does.
const ENGLISH: CurrentProtocol['localization'] = {
  defaultLocale: 'en',
  locales: ['en'],
};

/**
 * The protocol an authoring host starts a researcher with. Every interview has
 * to end at a finish stage, so it holds the one Network Canvas supplies, with
 * the closing text in each of its languages that has it, and the stages a
 * researcher adds go in front of it. It holds none of the interview's shared
 * words: the interview shows Network Canvas's wording for a protocol that
 * does not hold any.
 */
export function createEmptyProtocol({
  name,
  description,
  localization = ENGLISH,
}: {
  name: string;
  description?: string;
  localization?: CurrentProtocol['localization'];
}): CurrentProtocol {
  return {
    name,
    ...(description === undefined ? {} : { description }),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    localization,
    stages: [
      createDefaultFinishSessionStage({
        id: createProtocolObjectId(),
        localization,
      }),
    ],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}
