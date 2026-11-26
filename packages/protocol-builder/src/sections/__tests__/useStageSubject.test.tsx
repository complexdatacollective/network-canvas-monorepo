import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testTypeId } from '../../testing/testId.ts';
import { useStageSubject } from '../useStageSubject.ts';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');

function NodeSubjectProbe() {
  const subject = useStageSubject('node');
  return (
    <output data-testid="node-subject">
      {subject === undefined ? 'none' : JSON.stringify(subject)}
    </output>
  );
}

const nodeSubjectOf = async (types: string[]) => {
  renderStageEditor({
    stage: {
      type: 'NameGenerator',
      fields: {
        label: { 'en-US': 'New stage' },
        subject: { entity: 'node', types },
      },
    },
    sections: <NodeSubjectProbe />,
  });
  return (await screen.findByTestId('node-subject')).textContent;
};

describe('the node subject a section reads', () => {
  it('is the one type a stage lists', async () => {
    expect(await nodeSubjectOf([PERSON])).toBe(
      JSON.stringify({ entity: 'node', type: PERSON }),
    );
  });

  it('is nothing for a stage listing two types', async () => {
    expect(await nodeSubjectOf([PERSON, PLACE])).toBe('none');
  });
});
