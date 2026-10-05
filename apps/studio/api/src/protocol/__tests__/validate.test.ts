import { describe, expect, it } from 'vitest';

import { validateProtocol } from '@codaco/protocol-validation';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import {
  validateSection,
  validateStageSectionIdentity,
} from '@codaco/studio-sync/section-validation';

import { sectionizeProtocol } from '../sectionize.ts';
import { baseProtocol } from './helpers.ts';

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

  it('rejects a mismatched stage section identity', () => {
    const result = validateStageSectionIdentity('expected', { id: 'other' });
    expect(result.success).toBe(false);
  });
});

describe('validation layering', () => {
  it('cross-entity codebook violations pass write-time but fail assembled validation', async () => {
    const protocol = baseProtocol();
    // Legal per entity definition, illegal for the codebook as a whole.
    protocol.codebook.node = {
      ...protocol.codebook.node,
      colleague: {
        name: 'Colleague',
        label: { en: 'Colleague' },
        color: 'node-color-seq-2',
        shape: { default: 'circle' },
        variables: {
          personName: {
            name: 'OtherName',
            label: { en: 'Other name' },
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
