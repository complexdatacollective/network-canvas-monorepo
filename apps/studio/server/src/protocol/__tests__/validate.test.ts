import { describe, expect, it } from 'vitest';

import {
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { assembleProtocol } from '../assemble.ts';
import { sectionizeProtocol } from '../sectionize.ts';
import { validateSection, validateStageSectionIdentity } from '../validate.ts';
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
      schemaVersion: 8,
      unknown: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a mismatched stage section identity', () => {
    const result = validateStageSectionIdentity('expected', { id: 'other' });
    expect(result.success).toBe(false);
  });
});

describe('validation layering', () => {
  it('cross-entity codebook violations pass write-time but fail assembled validation', async () => {
    const protocol = baseProtocol();
    // The same variable record key on two node types: legal per entity
    // definition, illegal for the codebook as a whole (global key
    // uniqueness), so only the assembled document can reject it.
    protocol.codebook.node = {
      ...protocol.codebook.node,
      colleague: {
        name: 'Colleague',
        color: 'node-color-seq-2',
        shape: { default: 'circle' },
        variables: {
          personName: { name: 'OtherName', type: 'text' },
        },
      },
    } as typeof protocol.codebook.node;

    const sections = sectionizeProtocol(protocol);
    for (const [id, doc] of Object.entries(sections)) {
      expect(validateSection(id, doc).success, id).toBe(true);
    }

    const assembled = assembleProtocol(sections);
    const result = await validateProtocol(assembled as VersionedProtocol);
    expect(result.success).toBe(false);
  });
});
