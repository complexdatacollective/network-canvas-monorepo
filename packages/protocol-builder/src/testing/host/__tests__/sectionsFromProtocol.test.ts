import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { testVariableId, withTestCodebookIds } from '../../testId.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';

const SOCIOGRAM = testVariableId('sociogram');

describe('a protocol fixture with layouts', () => {
  it('gives a readable layout key the id testVariableId gives it', () => {
    const protocol = withTestCodebookIds({
      codebook: {
        layouts: {
          sociogram: { name: 'sociogram' },
          [testVariableId('kept')]: { name: 'kept' },
        },
      },
      stages: [],
    });

    expect(Object.keys(protocol.codebook.layouts)).toEqual([
      SOCIOGRAM,
      testVariableId('kept'),
    ]);
  });

  it('loads each layout into a section of its own, and leaves out one that is not an object', () => {
    const sections = sectionsFromProtocol({
      codebook: {
        layouts: { [SOCIOGRAM]: { name: 'sociogram' }, broken: 'sociogram' },
      },
      stages: [],
    });

    expect(
      sections[sectionId({ kind: 'codebookLayout', layoutId: SOCIOGRAM })],
    ).toEqual({ name: 'sociogram' });
    expect(Object.keys(sections)).not.toContain(
      sectionId({ kind: 'codebookLayout', layoutId: 'broken' }),
    );
  });
});
