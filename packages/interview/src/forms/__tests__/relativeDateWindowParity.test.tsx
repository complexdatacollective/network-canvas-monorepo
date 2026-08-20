import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RelativeDatePickerField from '@codaco/fresco-ui/form/fields/RelativeDatePicker';
import { generateNetwork } from '@codaco/protocol-utilities';
import {
  asEntityAttributeReference,
  type Codebook,
  DEFAULT_RESPONSE_BURDEN,
  type Stage,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { buildDatePickerBoundProps } from '../buildDatePickerBoundProps';

/**
 * A `RelativeDatePicker`'s window is derived three times over, by three packages
 * that cannot see each other: the field renders it as the native input's
 * `min`/`max`, `buildDatePickerBoundProps` turns it into the validators a
 * submission is checked against, and `@codaco/protocol-utilities` draws
 * synthetic values that have to land inside it. @codaco/interview is the one
 * package that depends on all three, so this is the only place they can be held
 * to one answer.
 *
 * They agree by reading `dateWithinPickerRange` from @codaco/shared-consts
 * rather than by each deriving the window itself. What that clamp is for is the
 * two ends of the calendar: `anchor: "9999-12-31"` with `after: 1` derives
 * `10000-01-01`, a five-digit year `matchesDatePattern` does not read as a date
 * at all — so the max validator compares the two strings lexically instead,
 * where a leading `1` sorts *below* every four-digit year and the field then
 * rejects every value it can hold, including whatever a participant types.
 * `anchor: "0001-01-01"` with `before: 400` overflows the same way downwards,
 * to `00-1-11-28`, which is not a date at all.
 *
 * The expected bounds are written out rather than computed from the clamp, so
 * that a clamp which is wrong in the same way everywhere still fails here.
 */
const cases = [
  {
    name: 'an ordinary window in the middle of the calendar',
    anchor: '2026-07-27',
    before: 180,
    after: 30,
    min: '2026-01-28',
    max: '2026-08-26',
  },
  {
    name: 'a leap day anchor',
    anchor: '2024-02-29',
    before: 30,
    after: 5,
    min: '2024-01-30',
    max: '2024-03-05',
  },
  {
    name: 'a single day past the last date the calendar offers',
    anchor: '9999-12-31',
    before: 0,
    after: 1,
    min: '9999-12-31',
    max: '9999-12-31',
  },
  {
    name: 'a millennium past the last date the calendar offers',
    anchor: '9999-12-31',
    before: 364,
    after: 365_250,
    min: '9999-01-01',
    max: '9999-12-31',
  },
  {
    name: 'reaching behind the first date the calendar offers',
    anchor: '0001-01-01',
    before: 180,
    after: 0,
    min: '0001-01-01',
    max: '0001-01-01',
  },
  {
    name: 'reaching a whole year behind the first date the calendar offers',
    anchor: '0001-06-15',
    before: 3650,
    after: 30,
    min: '0001-01-01',
    max: '0001-07-15',
  },
] as const;

/** The window the interview validates a submitted date against. */
function validatedWindow(parameters: {
  anchor: string;
  before: number;
  after: number;
}): { min: unknown; max: unknown } {
  const { min, max } = buildDatePickerBoundProps({
    component: 'RelativeDatePicker',
    parameters,
  });
  return { min, max };
}

/** The window the field itself offers, read off the rendered date input. */
function renderedWindow(parameters: {
  anchor: string;
  before: number;
  after: number;
}): { min: string; max: string } {
  const { container, unmount } = render(
    <RelativeDatePickerField
      name="lastSeen"
      anchor={parameters.anchor}
      before={parameters.before}
      after={parameters.after}
    />,
  );
  const input = container.querySelector('input[type="date"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('date input not rendered');
  }
  const window = { min: input.min, max: input.max };
  unmount();
  return window;
}

const variableId = 'lastSeen';

function egoCodebook(parameters: {
  anchor: string;
  before: number;
  after: number;
}): Codebook {
  return {
    ego: {
      variables: {
        [variableId]: {
          name: 'Last seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters,
          validation: { required: true },
        },
      },
    },
  };
}

const egoStages: Stage[] = [
  {
    id: 'stage-ego',
    type: 'EgoForm',
    // Schema-injected generation metadata: a parsed stage always carries
    // it, and nothing in this test reads it.
    synthetic: {
      generatesData: true,
      responseBurden: DEFAULT_RESPONSE_BURDEN.EgoForm,
    },
    label: 'About you',
    introductionPanel: { title: 'About you', text: 'A few questions.' },
    form: {
      fields: [
        {
          variable: asEntityAttributeReference(variableId),
          prompt: 'When did you last see them?',
        },
      ],
    },
  },
];

/** Every date the generator draws for the variable, across a spread of seeds. */
function generatedValues(parameters: {
  anchor: string;
  before: number;
  after: number;
}): string[] {
  const drawn: string[] = [];
  for (let seed = 1; seed <= 16; seed++) {
    const { network } = generateNetwork({
      seed,
      codebook: egoCodebook(parameters),
      stages: egoStages,
    });
    const value = network.ego?.[entityAttributesProperty][variableId];
    if (typeof value !== 'string') {
      throw new Error(`seed ${seed} generated no date for ${variableId}`);
    }
    drawn.push(value);
  }
  return drawn;
}

describe('every derivation of a relative-date window agrees', () => {
  it.each(cases)(
    'the field and the validators bound $name identically',
    ({ anchor, before, after, min, max }) => {
      const parameters = { anchor, before, after };

      expect(renderedWindow(parameters)).toEqual({ min, max });
      expect(validatedWindow(parameters)).toEqual({ min, max });
    },
  );

  // The generator's window is internal, so it is read through what it produces:
  // a value outside the window the other two derived is one the interview would
  // refuse. Every seed is checked rather than one, because an unclamped ceiling
  // leaves a window whose values alternate — whether a generated network
  // validated would otherwise be a matter of which seed produced it.
  it.each(cases)(
    'the generator draws only dates inside $name',
    ({ anchor, before, after, min, max }) => {
      const outside = generatedValues({ anchor, before, after }).filter(
        (value) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < min || value > max,
      );

      expect(outside).toEqual([]);
    },
  );
});
