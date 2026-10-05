import { describe, expect, it } from 'vitest';

import {
  parseSectionId,
  sectionId,
  type SectionRef,
  UnknownSectionIdError,
} from '../taxonomy.ts';

describe('protocol section taxonomy', () => {
  const refs: SectionRef[] = [
    { kind: 'settings' },
    { kind: 'stageOrder' },
    { kind: 'stage', stageId: 'stage:with:colons' },
    { kind: 'codebookNode', typeId: 'node:with:colons' },
    { kind: 'codebookEdge', typeId: 'edge:with:colons' },
    { kind: 'codebookEgo' },
    { kind: 'assets' },
  ];

  it.each(refs)('round-trips $kind identities', (ref) => {
    expect(parseSectionId(sectionId(ref))).toEqual(ref);
  });

  it.each([
    '',
    'stage:',
    'codebook:node:',
    'codebook:edge:',
    'codebook:unknown',
  ])('rejects unknown or empty identity %j', (id) => {
    expect(() => parseSectionId(id)).toThrow(UnknownSectionIdError);
  });

  it('rejects construction with an empty variable identity', () => {
    expect(() => sectionId({ kind: 'stage', stageId: '' })).toThrow(
      UnknownSectionIdError,
    );
  });
});
