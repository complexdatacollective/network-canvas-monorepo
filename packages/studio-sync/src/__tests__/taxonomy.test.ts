import { describe, expect, it } from 'vitest';

import { assembleProtocolSections } from '../protocol-document.ts';
import {
  assertSectionValid,
  SectionValidationFailedError,
  sectionShapeIssues,
} from '../section-validation.ts';
import {
  isCodebookSectionId,
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
    { kind: 'codebookLayout', layoutId: 'layout:with:colons' },
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
    'codebook:layout:',
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

describe('codebook layout sections', () => {
  const layoutId = '5b0c8f1e-3f4a-4d2b-9c6e-1a2b3c4d5e6f';

  it('round-trips codebook.layouts', () => {
    const id = sectionId({ kind: 'codebookLayout', layoutId });
    expect(id).toBe(`codebook:layout:${layoutId}`);
    expect(sectionShapeIssues(id, { name: 'sociogram' })).toEqual([]);

    const protocol = assembleProtocolSections({
      settings: { name: 'Study' },
      stageOrder: { stages: [] },
      [id]: { name: 'sociogram' },
    });
    expect(protocol.codebook).toEqual({
      layouts: { [layoutId]: { name: 'sociogram' } },
    });
  });

  it('refuses a layout section whose id is not a UUID or whose document is not a layout', () => {
    expect(
      sectionShapeIssues(
        sectionId({ kind: 'codebookLayout', layoutId: 'sociogram' }),
        { name: 'sociogram' },
      ),
    ).toEqual([{ path: [], message: 'layout id sociogram is not a UUID' }]);
    expect(
      sectionShapeIssues(sectionId({ kind: 'codebookLayout', layoutId }), {
        name: 'sociogram',
        type: 'layout',
      }),
    ).toEqual([expect.objectContaining({ path: [] })]);
  });

  it('counts a layout section as part of the codebook', () => {
    expect(
      isCodebookSectionId(sectionId({ kind: 'codebookLayout', layoutId })),
    ).toBe(true);
  });

  it('assembles no layouts record when the draft has no layout sections', () => {
    const protocol = assembleProtocolSections({
      settings: { name: 'Study' },
      stageOrder: { stages: [] },
    });
    expect(protocol.codebook).not.toHaveProperty('layouts');
  });

  it('accepts a valid layout section when committing it', () => {
    expect(() =>
      assertSectionValid(sectionId({ kind: 'codebookLayout', layoutId }), {
        name: 'sociogram',
      }),
    ).not.toThrow();
  });

  it.each([
    ['an id that is not a UUID', 'sociogram', { name: 'sociogram' }],
    ['a document that is not a layout', layoutId, { name: 1 }],
  ])('refuses to commit a layout section with %s', (_, id, doc) => {
    expect(() =>
      assertSectionValid(
        sectionId({ kind: 'codebookLayout', layoutId: id }),
        doc,
      ),
    ).toThrow(SectionValidationFailedError);
  });
});
