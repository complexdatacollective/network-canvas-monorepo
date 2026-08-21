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
  it('reads as default, with no reset, until something is authored', () => {
    setup({ variable: NUMBER });

    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Reset to default/ }),
    ).not.toBeInTheDocument();
  });

  it('summarises what generation would do while nothing is authored', () => {
    setup({ variable: TEXT });
    expect(screen.getByText('Person names')).toBeInTheDocument();
  });

  it('marks the block authored and offers to reset it', () => {
    setup({
      variable: { ...NUMBER, synthetic: { missingProbability: 0.2 } },
    });

    expect(screen.getByText('Authored')).toBeInTheDocument();
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
    expect(screen.getByText('Default')).toBeInTheDocument();
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
