import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { testId } from '../../../__tests__/testId.ts';
import { lastExistingWriterByType } from '../stageWrites.ts';

const sociogram: Extract<Stage, { type: 'Sociogram' }> = {
  id: testId('stageWrites/stage-soc'),
  label: { 'en-US': 'Sociogram' },
  type: 'Sociogram',
  subject: { entity: 'node', types: ['person', 'place'] },
  layout: 'layout-map',
  background: { concentricCircles: 3 },
  prompts: [
    {
      id: testId('stageWrites/prompt-highlight'),
      task: 'highlight',
      text: { 'en-US': 'Who and where matters most?' },
      highlight: [
        {
          id: testId('stageWrites/highlight-person'),
          type: 'person',
          variable: 'close',
        },
        {
          id: testId('stageWrites/highlight-place'),
          type: 'place',
          variable: 'favourite',
        },
      ],
    },
  ],
};

describe('lastExistingWriterByType', () => {
  it('records each highlight variable of a Sociogram showing two node types under its own type', () => {
    const writers = lastExistingWriterByType([sociogram]);

    expect(writers.get('person')).toEqual(new Map([['close', 0]]));
    expect(writers.get('place')).toEqual(new Map([['favourite', 0]]));
  });
});
