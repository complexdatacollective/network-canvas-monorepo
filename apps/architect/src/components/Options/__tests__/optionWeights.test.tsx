import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  DEFAULT_OPTION_WEIGHT,
  type VariableSynthetic,
} from '@codaco/protocol-validation';
import type { SyntheticVariableDraft } from '~/components/Codebook/VariableSynthetic/draft';
import { VariableSyntheticProvider } from '~/components/Codebook/VariableSynthetic/VariableSyntheticProvider';
import { VariableSyntheticSection } from '~/components/Codebook/VariableSynthetic/VariableSyntheticSection';
import Options, {
  type OptionValue,
} from '~/components/Form/arrayFields/Options';

import LockedOptions from '../LockedOptions';

/**
 * The disclosure that reveals the weight column, exercised against the REAL
 * options editor.
 *
 * The claim under test is a conditional one, so all four states are checked:
 * collapsed-and-unauthored is the only one that shows no column, and it is the
 * state every other options editor in Architect is permanently in — which is
 * what "pixel-identical to today" rests on.
 */

const OPTIONS: OptionValue[] = [
  { label: 'Sport', value: 'sport' },
  { label: 'Music', value: 'music' },
];

const VARIABLE: SyntheticVariableDraft = {
  name: 'hobbies',
  type: 'categorical',
  options: OPTIONS,
};

type HarnessProps = {
  authored?: VariableSynthetic | undefined;
  locked?: boolean;
  onValue?: (next: VariableSynthetic | undefined) => void;
  onOptionsChange?: (next: OptionValue[] | undefined) => void;
};

const Harness = ({
  authored,
  locked = false,
  onValue,
  onOptionsChange,
}: HarnessProps) => {
  const [synthetic, setSynthetic] = useState(authored);
  const [options, setOptions] = useState<OptionValue[]>(OPTIONS);

  return (
    <DialogProvider>
      <VariableSyntheticProvider
        variable={{ ...VARIABLE, options, synthetic }}
        namePrefix="synthetic"
        onChange={(next) => {
          setSynthetic(next);
          onValue?.(next);
        }}
      >
        {locked ? (
          <LockedOptions options={options} />
        ) : (
          <Options
            name="options"
            value={options}
            addButtonLabel="Create new option"
            onChange={(next) => {
              const list = (next ?? []) as OptionValue[];
              setOptions(list);
              onOptionsChange?.(list);
            }}
          />
        )}
        <VariableSyntheticSection />
      </VariableSyntheticProvider>
    </DialogProvider>
  );
};

const expand = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Synthetic data/ }));

const weightFields = () =>
  screen.queryAllByRole('spinbutton', { name: /^Weight for option/ });

describe('the option-weight column’s four states', () => {
  it('shows no column while the section is collapsed and nothing is authored', () => {
    render(<Harness />);
    expect(weightFields()).toHaveLength(0);
  });

  it('shows one weight per option while the section is expanded', () => {
    render(<Harness />);
    expand();
    expect(weightFields()).toHaveLength(OPTIONS.length);
  });

  it('keeps the column while the section is collapsed but content is authored', () => {
    render(
      <Harness authored={{ optionWeights: [{ value: 'sport', weight: 3 }] }} />,
    );
    expect(weightFields()).toHaveLength(OPTIONS.length);
  });

  it('keeps the column while the section is expanded and content is authored', () => {
    render(
      <Harness authored={{ optionWeights: [{ value: 'sport', weight: 3 }] }} />,
    );
    expand();
    expect(weightFields()).toHaveLength(OPTIONS.length);
  });

  it('takes the column away again when the section is collapsed unauthored', () => {
    render(<Harness />);
    expand();
    expect(weightFields()).toHaveLength(OPTIONS.length);

    fireEvent.click(screen.getByRole('button', { name: /^Synthetic data/ }));
    expect(weightFields()).toHaveLength(0);
  });
});

describe('what the column writes', () => {
  it('writes into the variable’s synthetic block, never into the option', () => {
    const written: (VariableSynthetic | undefined)[] = [];
    const optionWrites: (OptionValue[] | undefined)[] = [];
    render(
      <Harness
        onValue={(next) => written.push(next)}
        onOptionsChange={(next) => optionWrites.push(next)}
      />,
    );
    expand();

    const [first] = weightFields();
    if (!first) throw new Error('Expected a weight field for the first option');
    fireEvent.change(first, { target: { value: '4' } });

    expect(written.at(-1)).toEqual({
      optionWeights: [{ value: 'sport', weight: 4 }],
    });
    // The option list itself is untouched: weights are the variable's, not the
    // option's.
    expect(optionWrites).toEqual([]);
  });

  it('shows the neutral weight as a placeholder while nothing is authored', () => {
    render(<Harness />);
    expand();

    const [first] = weightFields();
    expect(first).toHaveValue(null);
    expect(first).toHaveAttribute('placeholder', String(DEFAULT_OPTION_WEIGHT));
  });

  it('shows an authored weight in its own option’s box', () => {
    render(
      <Harness authored={{ optionWeights: [{ value: 'music', weight: 7 }] }} />,
    );

    const [sport, music] = weightFields();
    expect(sport).toHaveValue(null);
    expect(music).toHaveValue(7);
  });
});

describe('an interface-owned option list', () => {
  it('grows the same column, because the interface owns the values, not the odds', () => {
    render(<Harness locked />);
    expect(weightFields()).toHaveLength(0);

    expand();
    expect(weightFields()).toHaveLength(OPTIONS.length);
    expect(
      screen.getByRole('columnheader', { name: 'Weight' }),
    ).toBeInTheDocument();
  });
});
