import { describe, expect, it } from 'vitest';

import type {
  StoredCurrentProtocol,
  StoredSchema8Protocol,
} from '~/lib/db/types';

import { protocolTotalSteps } from '../protocolTotalSteps';

const informationStage = (id: string) => ({
  id,
  type: 'Information' as const,
  label: id,
  items: [],
});

type CurrentStage = StoredCurrentProtocol['protocol']['stages'][number];

const currentInformationStage = (id: string): CurrentStage => ({
  id,
  type: 'Information',
  label: { en: id },
  title: { en: id },
  items: [],
});

const stageIds = ['one', 'two', 'three', 'four', 'five'];

function schema8Protocol(): StoredSchema8Protocol {
  return {
    id: 'schema-8',
    hash: 'schema-8-hash',
    name: 'Schema 8',
    schemaVersion: 8,
    importedAt: '2025-05-20T10:00:00.000Z',
    codebook: {},
    protocol: {
      name: 'Schema 8',
      schemaVersion: 8,
      codebook: {},
      stages: stageIds.map(informationStage),
    },
  };
}

function schema9Protocol(
  stages: StoredCurrentProtocol['protocol']['stages'],
): StoredCurrentProtocol {
  return {
    id: 'schema-9',
    hash: 'schema-9-hash',
    name: 'Schema 9',
    schemaVersion: 9,
    importedAt: '2026-09-05T00:00:00.000Z',
    codebook: {},
    protocol: {
      name: 'Schema 9',
      description: '',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {},
      stages,
    },
  };
}

describe('protocolTotalSteps', () => {
  it("counts Interviewer 8's appended finish stage for a schema 8 protocol", () => {
    // Interviewer 8's data view showed an interview on the last of five real
    // stages (currentStep 4) as "5 of 6", and a finished one (currentStep 5,
    // its own finish stage) as "6 of 6".
    expect(protocolTotalSteps(schema8Protocol())).toBe(6);
  });

  // Its own engine adds no finish stage (a schema 9 protocol has its own), so
  // the count is the stages' (getInterviewProgress, tested in the engine).
  it("counts a schema 9 protocol the way this app's engine does", () => {
    expect(
      protocolTotalSteps(
        schema9Protocol(stageIds.map(currentInformationStage)),
      ),
    ).toBe(5);
  });
});
