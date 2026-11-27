import { describe, expect, it } from 'vitest';

import {
  createProtocolObjectId,
  dynamicValueNameFor,
  NodeLabelSchema,
} from '@codaco/protocol-validation';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { nodeLabelPlanFor } from '../labelPlan';

const BUSY = testId('condition busy');
const UNUSED = testId('condition unused');
const OUTER = testId('dynamic outer');
const INNER = testId('dynamic inner');
const BEDS = testVariableId('beds');
const PLACE = testTypeId('place');

const shows = (id: string) =>
  `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id })}}`;
const bedsAbove = (value: number) => ({
  about: 'node',
  rules: [
    {
      type: 'node',
      id: createProtocolObjectId(),
      options: {
        type: PLACE,
        attribute: BEDS,
        operator: 'GREATER_THAN',
        value,
      },
    },
  ],
});

describe('the plan for reading a node label', () => {
  it('asks the conditions that the wording of its dynamic attributes reads, through the dynamic attributes it shows', () => {
    const label = NodeLabelSchema.parse({
      text: { en: `A ${shows(OUTER)} place` },
      conditions: { [BUSY]: bedsAbove(100), [UNUSED]: bedsAbove(5) },
      dynamicAttributes: {
        // Shows the other dynamic attribute in its wording only.
        [OUTER]: {
          logic: 'participant',
          participant: { en: 'your' },
          otherwise: { en: `**${shows(INNER)}**` },
        },
        // Chooses by a condition, and shows the first again, which is
        // read once.
        [INNER]: {
          logic: 'conditions',
          cases: [{ condition: BUSY, when: 'met', wording: { en: 'busy' } }],
          otherwise: { en: `quiet ${shows(OUTER)}` },
        },
      },
    });
    expect(
      nodeLabelPlanFor(label).facts.map(({ conditionId }) => conditionId),
    ).toEqual([BUSY]);
  });
});
