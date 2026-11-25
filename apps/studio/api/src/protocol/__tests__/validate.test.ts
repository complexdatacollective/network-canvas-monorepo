import { describe, expect, it } from 'vitest';

import { validateProtocol } from '@codaco/protocol-validation';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import {
  sectionShapeIssues,
  validateSection,
  validateStageSectionIdentity,
} from '@codaco/studio-sync/section-validation';

import { sectionizeProtocol } from '../sectionize.ts';
import { BASE_CODEBOOK_IDS, baseProtocol, testTypeId } from './helpers.ts';

describe('validateSection', () => {
  it('accepts every section of a valid protocol', () => {
    for (const [id, doc] of Object.entries(
      sectionizeProtocol(baseProtocol()),
    )) {
      expect(validateSection(id, doc).success, id).toBe(true);
    }
  });

  it('rejects a malformed stage', () => {
    const result = validateSection('stage:bad', {
      id: 'bad',
      type: 'NameGenerator',
      // label and required stage fields missing
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown settings key', () => {
    const result = validateSection('settings', {
      name: 'P',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      unknown: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts the localization declaration in settings', () => {
    const result = validateSection('settings', {
      name: 'P',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    });
    expect(result).toEqual({ success: true });
  });

  it('accepts the experiments setting in settings', () => {
    const result = validateSection('settings', {
      name: 'P',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      experiments: {},
    });
    expect(result).toEqual({ success: true });
  });

  it('accepts the protocol review experiment in settings', () => {
    const result = validateSection('settings', {
      name: 'P',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      experiments: {
        protocolReview: {
          studyContext: {
            researchQuestions: ['Q?'],
            population: 'Adults',
            administration: 'self_administered',
          },
        },
      },
    });
    expect(result).toEqual({ success: true });
  });

  it('accepts protocol review content of a shape the schema does not define', () => {
    const result = validateSection('settings', {
      name: 'P',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      experiments: {
        protocolReview: { studyContext: { researchQuestions: [] } },
      },
    });
    expect(result).toEqual({ success: true });
  });

  it('rejects the encrypted attributes experiment, which is no longer one', () => {
    const result = validateSection('settings', {
      name: 'P',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      experiments: { encryptedVariables: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a mismatched stage section identity', () => {
    const result = validateStageSectionIdentity('expected', { id: 'other' });
    expect(result.success).toBe(false);
  });

  it('refuses a node or edge type section whose type id is not a UUID', () => {
    const definition = { name: 'Knows', color: 'edge-color-seq-1' };
    expect(
      sectionShapeIssues(
        `codebook:edge:${BASE_CODEBOOK_IDS.knows}`,
        definition,
      ),
    ).toEqual([]);
    for (const id of ['codebook:node:person', 'codebook:edge:knows']) {
      expect(sectionShapeIssues(id, definition)).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('UUID') }),
      );
    }
  });
});

describe('validation layering', () => {
  it('cross-entity codebook violations pass write-time but fail assembled validation', async () => {
    const protocol = baseProtocol();
    // Legal per entity definition, illegal for the codebook as a whole.
    protocol.codebook.node = {
      ...protocol.codebook.node,
      [testTypeId('colleague')]: {
        name: 'Colleague',
        color: 'node-color-seq-2',
        shape: { default: 'circle' },
        variables: {
          [BASE_CODEBOOK_IDS.personName]: {
            name: 'OtherName',
            type: 'text',
          },
        },
      },
    };

    const sections = sectionizeProtocol(protocol);
    for (const [id, doc] of Object.entries(sections)) {
      expect(validateSection(id, doc).success, id).toBe(true);
    }

    const assembled = assembleProtocolSections(sections);
    const result = await validateProtocol(assembled);
    expect(result.success).toBe(false);
  });
});
