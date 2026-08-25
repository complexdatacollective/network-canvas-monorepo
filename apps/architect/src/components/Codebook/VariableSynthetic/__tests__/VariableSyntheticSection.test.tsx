import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  MAX_SYNTHETIC_OPTION_WEIGHT,
  type VariableSynthetic,
} from '@codaco/protocol-validation';

import type { SyntheticVariableDraft } from '../draft';
import { NO_IMPLIED_RULES, type VariableImpliedRules } from '../impliedRules';
import {
  VariableSyntheticProvider,
  type OptionWeightsHost,
} from '../VariableSyntheticProvider';
import { VariableSyntheticSection } from '../VariableSyntheticSection';

/**
 * The shared sub-editor, exercised through the controls a researcher actually
 * operates and asserted on the block it SERIALISES — the thing the protocol
 * ends up carrying (spec governing rule 4: authored = key present).
 *
 * Every window and every refusal here comes from the real schema; nothing is
 * mocked, so a rule the schema tightens tightens these tests with it.
 */

type HarnessProps = {
  variable: SyntheticVariableDraft;
  implied?: VariableImpliedRules;
  optionWeightsHost?: OptionWeightsHost;
  onValue: (next: VariableSynthetic | undefined) => void;
};

const Harness = ({
  variable,
  implied = NO_IMPLIED_RULES,
  optionWeightsHost = 'inline',
  onValue,
}: HarnessProps) => {
  const [synthetic, setSynthetic] = useState(variable.synthetic);
  return (
    <VariableSyntheticProvider
      variable={{ ...variable, synthetic }}
      implied={implied}
      namePrefix="synthetic"
      optionWeightsHost={optionWeightsHost}
      onChange={(next) => {
        setSynthetic(next);
        onValue(next);
      }}
    >
      <VariableSyntheticSection />
    </VariableSyntheticProvider>
  );
};

const setup = (props: Omit<HarnessProps, 'onValue'>) => {
  const written: (VariableSynthetic | undefined)[] = [];
  render(<Harness {...props} onValue={(next) => written.push(next)} />);
  return {
    written,
    latest: () => written.at(-1),
    // Anchored: the reset button is deliberately named by its own label plus
    // the section title, so an unanchored match finds both.
    expand: () =>
      fireEvent.click(screen.getByRole('button', { name: /^Synthetic data/ })),
  };
};

const commit = (control: HTMLElement, value: string) => {
  fireEvent.change(control, { target: { value } });
  fireEvent.blur(control);
};

const NUMBER: SyntheticVariableDraft = { name: 'age', type: 'number' };
const BOUNDED_NUMBER: SyntheticVariableDraft = {
  name: 'age',
  type: 'number',
  validation: { minValue: 18, maxValue: 80 },
};
const SCALAR: SyntheticVariableDraft = { name: 'closeness', type: 'scalar' };
const BOOLEAN: SyntheticVariableDraft = { name: 'is_close', type: 'boolean' };
const TEXT: SyntheticVariableDraft = { name: 'name', type: 'text' };
const ORDINAL: SyntheticVariableDraft = {
  name: 'closeness',
  type: 'ordinal',
  options: [
    { label: 'Low', value: 'low' },
    { label: 'High', value: 'high' },
  ],
};
const CATEGORICAL: SyntheticVariableDraft = {
  name: 'hobbies',
  type: 'categorical',
  options: [
    { label: 'Sport', value: 'sport' },
    { label: 'Music', value: 'music' },
    { label: 'Reading', value: 'reading' },
  ],
};
const DATETIME: SyntheticVariableDraft = {
  name: 'met_on',
  type: 'datetime',
  component: 'DatePicker',
};

describe('the controls each variable type offers', () => {
  it('offers a number the distribution families its schema admits', () => {
    const { expand } = setup({ variable: NUMBER });
    expand();

    const select = screen.getByRole('combobox', {
      name: 'How values are spread',
    });
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['', 'constant', 'uniform', 'normal', 'lognormal']);
  });

  it('offers a scalar its own families, which a number does not have', () => {
    const { expand } = setup({ variable: SCALAR });
    expand();

    const select = screen.getByRole('combobox', {
      name: 'How values are spread',
    });
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['', 'constant', 'uniform', 'normal', 'beta']);
  });

  it('authors a family with parameters the schema accepts', () => {
    const { expand, latest } = setup({ variable: NUMBER });
    expand();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'How values are spread' }),
      { target: { value: 'normal' } },
    );

    expect(latest()).toEqual({ distribution: 'normal', mean: 0, sd: 0 });
    expect(
      screen.getByRole('spinbutton', { name: 'Mean' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Standard deviation' }),
    ).toBeInTheDocument();
  });

  it('gives a boolean a chance of answering yes', () => {
    const { expand, latest } = setup({ variable: BOOLEAN });
    expand();

    commit(
      screen.getByRole('spinbutton', { name: 'Chance of answering yes' }),
      '0.7',
    );
    expect(latest()).toEqual({ probabilityTrue: 0.7 });
  });

  it('shows a text variable the generator its name infers, and lets it be changed', () => {
    const { expand, latest } = setup({ variable: TEXT });
    expand();

    const select = screen.getByRole('combobox', {
      name: 'What the generated text looks like',
    });
    expect(
      screen.getByRole('option', { name: 'Use the default (Person names)' }),
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'occupation' } });
    expect(latest()).toEqual({ generator: 'occupation' });
  });

  it('gives a datetime a session-relative window', () => {
    const { expand, latest } = setup({ variable: DATETIME });
    expand();

    commit(
      screen.getByRole('spinbutton', {
        name: 'Days before the interview date',
      }),
      '30',
    );
    expect(latest()).toEqual({
      distribution: 'uniform',
      relative: { before: 30, after: 0 },
    });
  });

  it('returns a cleared window to exactly what was never authored', () => {
    // Clearing has to be the inverse of authoring, byte for byte. A stored
    // `{ before: 0, after: 0 }` is a window of zero width — every generated
    // date on the day the interview ran — which is the opposite of the reach
    // back the schema resolves for a window nobody stated.
    const { expand, latest } = setup({ variable: DATETIME });
    expand();

    const before = screen.getByRole('spinbutton', {
      name: 'Days before the interview date',
    });
    commit(before, '30');
    expect(latest()).toEqual({
      distribution: 'uniform',
      relative: { before: 30, after: 0 },
    });

    commit(before, '');

    expect(latest()).toEqual(DATETIME.synthetic);
    expect(latest()).toBeUndefined();
  });

  it('keeps the rest of the block when the window is cleared', () => {
    const { expand, latest } = setup({
      variable: { ...DATETIME, synthetic: { missingProbability: 0.2 } },
    });
    expand();

    const before = screen.getByRole('spinbutton', {
      name: 'Days before the interview date',
    });
    commit(before, '30');
    commit(before, '');

    // The discriminant left with the window it was there to make parse; the
    // missingness the author stated separately stayed.
    expect(latest()).toEqual({ missingProbability: 0.2 });
  });

  it('states the untouched offset at what an unstated window resolves to', () => {
    const { expand, latest } = setup({ variable: DATETIME });
    expand();

    commit(
      screen.getByRole('spinbutton', {
        name: 'Days after the interview date',
      }),
      '7',
    );

    // Not a zero nobody wrote: the reach back is the schema's own resolution
    // of an unstated window, so authoring one side does not silently discard
    // the other.
    expect(latest()).toEqual({
      distribution: 'uniform',
      relative: { before: 3650, after: 7 },
    });
  });

  it('withholds the relative window from a control that already fixes its range', () => {
    const { expand } = setup({
      variable: { ...DATETIME, component: 'RelativeDatePicker' },
    });
    expand();

    expect(
      screen.queryByRole('spinbutton', {
        name: 'Days before the interview date',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/already fixes the range/)).toBeInTheDocument();
  });

  it('gives every applicable type a chance of no answer', () => {
    const { expand, latest } = setup({ variable: TEXT });
    expand();

    commit(
      screen.getByRole('spinbutton', { name: 'Chance of no answer' }),
      '0.15',
    );
    expect(latest()).toEqual({ missingProbability: 0.15 });
  });
});

describe('the window a parameter is held inside', () => {
  it('clamps a number’s parameters to its own validation range', () => {
    const { expand, latest } = setup({ variable: BOUNDED_NUMBER });
    expand();
    fireEvent.change(
      screen.getByRole('combobox', { name: 'How values are spread' }),
      { target: { value: 'constant' } },
    );

    const field = screen.getByRole('spinbutton', { name: 'Value' });
    expect(field).toHaveAttribute('min', '18');
    expect(field).toHaveAttribute('max', '80');
    // The middle of the range, because a bounded parameter has to arrive
    // somewhere the whole range is reachable from.
    expect(latest()).toEqual({ distribution: 'constant', value: 49 });

    commit(field, '100');
    expect(latest()).toEqual({ distribution: 'constant', value: 49 });
    expect(field).toHaveValue(49);
  });

  it('accepts a value the range does admit', () => {
    const { expand, latest } = setup({ variable: BOUNDED_NUMBER });
    expand();
    fireEvent.change(
      screen.getByRole('combobox', { name: 'How values are spread' }),
      { target: { value: 'constant' } },
    );

    commit(screen.getByRole('spinbutton', { name: 'Value' }), '65');
    expect(latest()).toEqual({ distribution: 'constant', value: 65 });
  });

  it('lets a spread distribution reach outside the variable’s own range', () => {
    // Generation clamps a drawn value into the validation window, so a mean
    // below the floor is a declaration the schema ACCEPTS — the draws pile up
    // at 18 rather than being refused. Holding the box to the validation
    // window made a schema-legal descriptor unwritable.
    const { expand, latest } = setup({
      variable: {
        ...BOUNDED_NUMBER,
        synthetic: { distribution: 'normal', mean: 49, sd: 5 },
      },
    });
    expand();

    const mean = screen.getByRole('spinbutton', { name: 'Mean' });
    expect(mean).not.toHaveAttribute('min');
    commit(mean, '10');

    expect(latest()).toEqual({ distribution: 'normal', mean: 10, sd: 5 });
  });

  it('closes the same box onto the range when nothing else can reach it', () => {
    // A spread of zero draws the mean and nothing else, and the schema refuses
    // a mean outside the window then — so the window binds the box again. The
    // rule is the schema's, asked of it, rather than a list kept here.
    const { expand, latest } = setup({
      variable: {
        ...BOUNDED_NUMBER,
        synthetic: { distribution: 'normal', mean: 49, sd: 0 },
      },
    });
    expand();

    const mean = screen.getByRole('spinbutton', { name: 'Mean' });
    expect(mean).toHaveAttribute('min', '18');
    expect(mean).toHaveAttribute('max', '80');

    commit(mean, '10');
    expect(latest()).toBeUndefined();
  });

  it('holds a probability to nought and one', () => {
    const { expand, latest } = setup({ variable: BOOLEAN });
    expand();

    const field = screen.getByRole('spinbutton', {
      name: 'Chance of answering yes',
    });
    expect(field).toHaveAttribute('min', '0');
    expect(field).toHaveAttribute('max', '1');

    commit(field, '4');
    expect(latest()).toBeUndefined();
  });
});

describe('a refusal no single field can state', () => {
  /**
   * Cross-field rules — a beta whose spread its own mean cannot support, a
   * minimum above its maximum — cannot be expressed as a window, so the
   * control has to say what the SCHEMA said. Swallowed, the box simply snapped
   * back on blur and the researcher was told nothing at all.
   */
  it('shows the schema’s own sentence for a beta spread its mean cannot support', () => {
    const { expand, latest } = setup({
      variable: {
        ...SCALAR,
        synthetic: { distribution: 'beta', mean: 0.5, sd: 0.1 },
      },
    });
    expand();

    commit(
      screen.getByRole('spinbutton', { name: 'Standard deviation' }),
      '0.9',
    );

    expect(
      screen.getByText('A beta distribution requires sd² < mean × (1 − mean)'),
    ).toBeInTheDocument();
    // Refused, so nothing was written.
    expect(latest()).toBeUndefined();
  });

  it('shows it for a minimum above its own maximum', () => {
    const { expand, latest } = setup({
      variable: {
        ...NUMBER,
        synthetic: { distribution: 'uniform', min: 2, max: 6 },
      },
    });
    expand();

    commit(screen.getByRole('spinbutton', { name: 'Lowest value' }), '9');

    expect(
      screen.getByText('"min" must not be greater than "max"'),
    ).toBeInTheDocument();
    expect(latest()).toBeUndefined();
  });

  it('clears the refusal once the schema accepts a change', () => {
    const { expand, latest } = setup({
      variable: {
        ...SCALAR,
        synthetic: { distribution: 'beta', mean: 0.5, sd: 0.1 },
      },
    });
    expand();

    const sd = screen.getByRole('spinbutton', { name: 'Standard deviation' });
    commit(sd, '0.9');
    commit(sd, '0.2');

    expect(
      screen.queryByText(
        'A beta distribution requires sd² < mean × (1 − mean)',
      ),
    ).not.toBeInTheDocument();
    expect(latest()).toEqual({ distribution: 'beta', mean: 0.5, sd: 0.2 });
  });
});

describe('changing which family draws the values', () => {
  /**
   * The numbers come across where the new family can hold them, and only the
   * ones it cannot start over. Carrying the pair wholesale meant a normal
   * whose spread beta's `sd² < mean × (1 − mean)` cannot support refused the
   * switch outright: the select stayed on Normal, beta's controls never
   * mounted, and the only way through was to guess which number to shrink
   * first, on a distribution that was not on screen.
   */
  it('starts the parameters the new family cannot carry, and keeps the ones it can', () => {
    const { expand, latest } = setup({
      variable: {
        ...SCALAR,
        synthetic: {
          distribution: 'normal',
          mean: 0.5,
          sd: 0.9,
          missingProbability: 0.1,
        },
      },
    });
    expand();

    const select = screen.getByRole('combobox', {
      name: 'How values are spread',
    });
    fireEvent.change(select, { target: { value: 'beta' } });

    // 0.9² ≥ 0.5 × 0.5, so the spread cannot come with it; the mean can.
    expect(latest()).toEqual({
      distribution: 'beta',
      mean: 0.5,
      sd: 0,
      missingProbability: 0.1,
    });
    // The switch actually happened, so the beta controls are there to work on.
    expect(select).toHaveValue('beta');
    expect(
      screen.getByRole('spinbutton', { name: 'Standard deviation' }),
    ).toHaveValue(0);
  });

  it('carries both numbers when the new family accepts them together', () => {
    const { expand, latest } = setup({
      variable: {
        ...SCALAR,
        synthetic: { distribution: 'normal', mean: 0.9, sd: 0.05 },
      },
    });
    expand();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'How values are spread' }),
      { target: { value: 'beta' } },
    );

    // 0.05² < 0.9 × 0.1, so nothing here has to be given up.
    expect(latest()).toEqual({ distribution: 'beta', mean: 0.9, sd: 0.05 });
  });
});

describe('option weights', () => {
  it('bounds a weight by the schema’s own ceiling', () => {
    const { expand, latest } = setup({ variable: ORDINAL });
    expand();

    const field = screen.getByRole('spinbutton', { name: 'Weight for low' });
    expect(field).toHaveAttribute('min', '0');
    expect(field).toHaveAttribute('max', String(MAX_SYNTHETIC_OPTION_WEIGHT));

    commit(field, String(MAX_SYNTHETIC_OPTION_WEIGHT + 1));
    expect(latest()).toBeUndefined();
  });

  it('writes a weight into the variable’s block, keyed by option value', () => {
    const { expand, latest } = setup({ variable: ORDINAL });
    expand();

    commit(screen.getByRole('spinbutton', { name: 'Weight for high' }), '4');
    expect(latest()).toEqual({
      optionWeights: [{ value: 'high', weight: 4 }],
    });
  });

  it('refuses a table that would leave nothing to draw', () => {
    const { expand, latest } = setup({ variable: ORDINAL });
    expand();

    commit(screen.getByRole('spinbutton', { name: 'Weight for low' }), '0');
    expect(latest()).toEqual({ optionWeights: [{ value: 'low', weight: 0 }] });

    // Zeroing the second option too would leave the draw nothing at all.
    commit(screen.getByRole('spinbutton', { name: 'Weight for high' }), '0');
    expect(latest()).toEqual({ optionWeights: [{ value: 'low', weight: 0 }] });
  });

  it('points at the options editor where one is rendering the column', () => {
    const { expand } = setup({
      variable: ORDINAL,
      optionWeightsHost: 'options-editor',
    });
    expand();

    expect(
      screen.queryByRole('spinbutton', { name: 'Weight for low' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/options list for this attribute/),
    ).toBeInTheDocument();
  });
});

describe('how many options a categorical is answered with', () => {
  const sizesOffered = (row: number) =>
    [
      ...screen
        .getByRole('combobox', { name: `Number of selections, row ${row}` })
        .querySelectorAll('option'),
    ].map((option) => option.value);

  it('offers only the sizes the schema accepts, and never one another row holds', () => {
    const { expand } = setup({ variable: CATEGORICAL });
    expand();

    // The resolved default already spreads across one and two selections, so
    // each row offers its own size plus the sizes no other row has taken.
    expect(sizesOffered(1)).toEqual(['0', '1', '3']);
    expect(sizesOffered(2)).toEqual(['0', '2', '3']);
  });

  it('never offers no selections at all where an answer is required', () => {
    const { expand } = setup({
      variable: CATEGORICAL,
      implied: {
        rules: { required: true },
        binOnly: false,
        alwaysAnsweredBy: ['About them'],
        selectionPinnedBy: [],
      },
    });
    expand();

    expect(sizesOffered(1)).not.toContain('0');
  });

  it('keeps the shares a distribution as they are edited', () => {
    const { expand, latest } = setup({ variable: CATEGORICAL });
    expand();

    commit(
      screen.getByRole('spinbutton', { name: 'Share for 1 selections' }),
      '0.75',
    );

    const table = latest() as { selectionCount: { probabilities: unknown[] } };
    const shares = table.selectionCount.probabilities as {
      count: number;
      probability: number;
    }[];
    expect(shares.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(
      1,
      10,
    );
    expect(shares.find((row) => row.count === 1)?.probability).toBeGreaterThan(
      0.5,
    );
  });
});

describe('rules the protocol’s interfaces impose', () => {
  const quickAdd: VariableImpliedRules = {
    rules: { required: true },
    binOnly: false,
    alwaysAnsweredBy: ['Quick Add Name Generator'],
    selectionPinnedBy: [],
  };

  const categoricalBin: VariableImpliedRules = {
    rules: { required: true, maxSelected: 1 },
    binOnly: true,
    alwaysAnsweredBy: ['Contact Types'],
    selectionPinnedBy: ['Contact Types'],
  };

  it('disables missingness on a quick-add variable, and says which stage', () => {
    const { expand } = setup({ variable: TEXT, implied: quickAdd });
    expand();

    expect(
      screen.getByRole('spinbutton', { name: 'Chance of no answer' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Always answered — ‘Quick Add Name Generator’ cannot leave this attribute blank, so it is never missing.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves missingness alone where nothing implies an answer', () => {
    const { expand } = setup({ variable: TEXT });
    expand();

    expect(
      screen.getByRole('spinbutton', { name: 'Chance of no answer' }),
    ).not.toBeDisabled();
  });

  it('disables the selection table on a bin-written categorical, naming the bin', () => {
    const { expand } = setup({
      variable: CATEGORICAL,
      implied: categoricalBin,
    });
    expand();

    expect(
      screen.queryByRole('combobox', { name: 'Number of selections, row 1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Single choice — ‘Contact Types’ assigns exactly one option, so the number of selections cannot vary.',
      ),
    ).toBeInTheDocument();
  });

  it('still allows option weights on a bin-written categorical', () => {
    const { expand, latest } = setup({
      variable: CATEGORICAL,
      implied: categoricalBin,
    });
    expand();

    commit(screen.getByRole('spinbutton', { name: 'Weight for sport' }), '5');
    expect(latest()).toEqual({
      optionWeights: [{ value: 'sport', weight: 5 }],
    });
  });
});

describe('authored and default', () => {
  it('offers no reset until something is authored', () => {
    setup({ variable: NUMBER });

    expect(
      screen.queryByRole('button', { name: /Reset to default/ }),
    ).not.toBeInTheDocument();
  });

  it('summarises what generation would do while nothing is authored', () => {
    setup({ variable: TEXT });
    expect(screen.getByText('Person names')).toBeInTheDocument();
  });

  it('offers to reset an authored block, and summarises it', () => {
    setup({
      variable: { ...NUMBER, synthetic: { missingProbability: 0.2 } },
    });

    // The reset affordance is the ONLY thing that says the block is authored
    // (spec revision 2, item 3 removed the badge); the summary goes on saying
    // what a run would do either way.
    expect(
      screen.getByRole('button', { name: /Reset to default/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('uniform(min 18, max 80), missing 20%'),
    ).toBeInTheDocument();
  });

  it('removes the key entirely when reset', () => {
    const { latest } = setup({
      variable: { ...NUMBER, synthetic: { missingProbability: 0.2 } },
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset to default/ }));
    expect(latest()).toBeUndefined();
    // And the affordance goes with it: there is nothing left to reset.
    expect(
      screen.queryByRole('button', { name: /Reset to default/ }),
    ).not.toBeInTheDocument();
  });

  it('shows no authored/default wording anywhere on the row', () => {
    // The badge is gone from every synthetic surface (spec revision 2, item
    // 3). Asserted here rather than only on the shared component because this
    // is a surface a researcher meets, and a badge reintroduced by a wrapper
    // would pass a component-level test.
    setup({ variable: { ...NUMBER, synthetic: { missingProbability: 0.2 } } });

    expect(screen.queryByText('Authored')).not.toBeInTheDocument();
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('reads an emptied control as unauthored rather than as an empty block', () => {
    const { expand, latest } = setup({
      variable: { ...BOOLEAN, synthetic: { probabilityTrue: 0.7 } },
    });
    expand();

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Chance of answering yes' }),
      { target: { value: '' } },
    );
    expect(latest()).toBeUndefined();
  });
});

describe('variable types with nothing to generate', () => {
  it('renders no section for a layout variable', () => {
    setup({ variable: { name: 'position', type: 'layout' } });
    expect(screen.queryByText(/Synthetic data/)).not.toBeInTheDocument();
  });
});

describe('every datetime parameter the schema admits', () => {
  it('offers the family, the cluster, the relative window and the fixed one', () => {
    const { expand } = setup({ variable: DATETIME });
    expand();

    // Everything `DatetimeSyntheticSchema` accepts has a control: without the
    // fixed window and the clustered family, an imported descriptor using
    // either could only be kept exactly as it was or reset away wholesale.
    expect(
      screen.getByRole('combobox', { name: 'How dates are chosen' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Earliest date')).toBeInTheDocument();
    expect(screen.getByLabelText('Latest date')).toBeInTheDocument();
    expect(screen.getByLabelText('Count those days from')).toBeInTheDocument();
  });

  it('writes a fixed window at the variable’s own resolution', () => {
    const { expand, latest } = setup({
      variable: {
        ...DATETIME,
        parameters: { type: 'month', min: '2020-01', max: '2030-12' },
      },
    });
    expand();

    // The control is the app's own DatePicker, given this variable's own
    // resolution, so a date at the wrong one is not enterable rather than
    // refused afterwards (spec rule 2).
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Earliest date Year' }),
      { target: { value: '2024' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Earliest date Month' }),
      { target: { value: '06' } },
    );

    expect(latest()).toEqual({ distribution: 'uniform', min: '2024-06' });
  });

  it('states a cluster once its date is chosen, and its spread after', () => {
    const { expand, latest } = setup({ variable: DATETIME });
    expand();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'How dates are chosen' }),
      { target: { value: 'normal' } },
    );
    // Choosing the family alone states nothing: a cluster the schema would
    // refuse for want of its date is not written and then complained about.
    expect(latest()).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Date the answers gather around'), {
      target: { value: '2024-06-01' },
    });
    expect(latest()).toEqual({
      distribution: 'normal',
      mean: '2024-06-01',
      sdDays: 0,
    });

    commit(
      screen.getByRole('spinbutton', {
        name: 'How far from that date answers usually fall, in days',
      }),
      '14',
    );
    expect(latest()).toEqual({
      distribution: 'normal',
      mean: '2024-06-01',
      sdDays: 14,
    });
  });

  it('still offers the fixed window to a control that fixes its own range', () => {
    // A RelativeDatePicker refuses a synthetic `relative` window — it already
    // collects within one — but it accepts every other datetime parameter.
    // Offering such a variable nothing but its missingness was the gap.
    const { expand } = setup({
      variable: { ...DATETIME, component: 'RelativeDatePicker' },
    });
    expand();

    expect(screen.getByText(/already fixes the range/)).toBeInTheDocument();
    expect(screen.getByLabelText('Earliest date')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'How dates are chosen' }),
    ).toBeInTheDocument();
  });

  it('keeps offering the relative window beside an authored fixed one', () => {
    // The schema refuses the PAIR, not the relative window — so hiding the
    // control because a `min` is authored would report the wrong reason and
    // leave no way back to a session-relative window short of a full reset.
    const { expand } = setup({
      variable: {
        ...DATETIME,
        synthetic: { distribution: 'uniform', min: '2024-01-01' },
      },
    });
    expand();

    expect(
      screen.getByRole('spinbutton', {
        name: 'Days before the interview date',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already fixes the range/)).toBeNull();
  });

  it('leaves an anchor and a cluster date free of the field’s own bounds', () => {
    // Neither names a date the FIELD collects: an anchor is the point a
    // session-relative window is measured from, and a mean with a spread that
    // can still reach the window is a declaration the schema accepts. A field
    // capped at 2020 must not stop a window being anchored in 2021.
    const { expand } = setup({
      variable: {
        ...DATETIME,
        parameters: { type: 'full', min: '2000-01-01', max: '2020-12-31' },
      },
    });
    expand();

    const anchor = screen.getByLabelText('Count those days from');
    expect(anchor).not.toHaveAttribute('max');
    expect(anchor).not.toHaveAttribute('min');
    // The window's own ends are a different matter: those ARE dates the field
    // collects, and the schema holds them to its resolution and range.
    expect(screen.getByLabelText('Earliest date')).toHaveAttribute(
      'max',
      '2020-12-31',
    );
  });

  it('returns the family to the default when the block is reset', () => {
    const { expand, latest } = setup({ variable: DATETIME });
    expand();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'How dates are chosen' }),
      { target: { value: 'normal' } },
    );
    fireEvent.change(screen.getByLabelText('Date the answers gather around'), {
      target: { value: '2024-06-01' },
    });
    expect(latest()).toMatchObject({ distribution: 'normal' });

    fireEvent.click(screen.getByRole('button', { name: /Reset to default/ }));

    // The controls follow the block out: a select still reading "clustered"
    // beside a summary that has gone back to the default describes a
    // descriptor that no longer exists.
    expect(latest()).toBeUndefined();
    expect(
      screen.getByRole('combobox', { name: 'How dates are chosen' }),
    ).toHaveValue('uniform');
    expect(
      screen.queryByLabelText('Date the answers gather around'),
    ).not.toBeInTheDocument();
  });

  it('says what the schema said when a window states its floor twice', () => {
    const { expand, latest } = setup({
      variable: {
        ...DATETIME,
        synthetic: {
          distribution: 'uniform',
          relative: { before: 30, after: 0 },
        },
      },
    });
    expand();

    fireEvent.change(screen.getByLabelText('Earliest date'), {
      target: { value: '2024-06-01' },
    });

    // Refused by the schema, in the schema's own words, with the block left
    // as it was rather than half-written.
    expect(latest()).toBeUndefined();
    expect(
      screen.getByText(
        'A synthetic date window declares its floor either as "min" or as a relative "before", not both',
      ),
    ).toBeInTheDocument();
  });
});

describe('putting one parameter back to its default', () => {
  it('removes a selection table with its last row, keeping the rest', () => {
    // The section's own reset would take the missingness with it, so the last
    // row has to be removable: it is the only way back to the schema's
    // resolved table for this one parameter.
    const { expand, latest } = setup({
      variable: {
        ...CATEGORICAL,
        synthetic: {
          selectionCount: { probabilities: [{ count: 2, probability: 1 }] },
          missingProbability: 0.2,
        },
      },
    });
    expand();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove the row for 2 selections' }),
    );

    expect(latest()).toEqual({ missingProbability: 0.2 });
  });
});

describe('what the schema said about an edit it refused', () => {
  it('explains a weights table that would leave nothing to draw', () => {
    const { expand, latest } = setup({ variable: ORDINAL });
    expand();

    commit(screen.getByRole('spinbutton', { name: 'Weight for low' }), '0');
    expect(latest()).toEqual({ optionWeights: [{ value: 'low', weight: 0 }] });

    commit(screen.getByRole('spinbutton', { name: 'Weight for high' }), '0');

    // Refused, and SAID: the box used to snap back on blur with the schema's
    // explanation thrown away (spec rule 3 — a refusal is never hidden).
    expect(latest()).toEqual({ optionWeights: [{ value: 'low', weight: 0 }] });
    expect(
      screen.getByText('At least one option value must have a positive weight'),
    ).toBeInTheDocument();
  });

  it('explains a chance of yes a one-sided list can never draw', () => {
    const { expand, latest } = setup({
      variable: {
        name: 'is_close',
        type: 'boolean',
        component: 'Boolean',
        options: [{ label: 'Yes', value: true }],
      },
    });
    expand();

    commit(
      screen.getByRole('spinbutton', { name: 'Chance of answering yes' }),
      '0.4',
    );

    expect(latest()).toBeUndefined();
    expect(
      screen.getByText(
        'probabilityTrue 0.4 cannot be drawn when the only option offered is true',
      ),
    ).toBeInTheDocument();
  });
});
