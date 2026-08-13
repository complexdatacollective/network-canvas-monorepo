import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { StageNodeAndEdgeSynthetic } from '@codaco/protocol-validation';

import { SyntheticField } from './SyntheticData';

/**
 * The section is a controlled field, so the round trip is what matters: an
 * edit the author makes only survives if what the field emits comes back as
 * its value. Rendered with a fixed `value`, every intermediate state would
 * appear to be preserved whether the component preserved it or not.
 */
function ControlledSyntheticField({
  initialValue,
  onEmit,
  showCount,
  showTopology,
  interfaceType,
}: {
  initialValue: StageNodeAndEdgeSynthetic;
  onEmit: (next: StageNodeAndEdgeSynthetic | null) => void;
  showCount: boolean;
  showTopology: boolean;
  interfaceType: string;
}) {
  const [value, setValue] = useState<StageNodeAndEdgeSynthetic | undefined>(
    initialValue,
  );
  return (
    <SyntheticField
      value={value}
      onChange={(next) => {
        setValue(next ?? undefined);
        onEmit(next);
      }}
      showCount={showCount}
      showTopology={showTopology}
      interfaceType={interfaceType}
    />
  );
}

describe('SyntheticField count means', () => {
  it('allows negative normal means while keeping Poisson nonnegative', () => {
    const { rerender } = render(
      <SyntheticField
        value={{ count: { distribution: 'normal', mean: -2, sd: 3 } }}
        showCount
        showTopology={false}
        interfaceType="NameGenerator"
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Mean' }),
    ).not.toHaveAttribute('min');

    rerender(
      <SyntheticField
        value={{ count: { distribution: 'poisson', mean: 2 } }}
        showCount
        showTopology={false}
        interfaceType="NameGenerator"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Mean' })).toHaveAttribute(
      'min',
      '0',
    );
  });

  it('allows negative normal mean-degree means while keeping density nonnegative', () => {
    const { rerender } = render(
      <SyntheticField
        value={{
          topology: {
            metric: 'meanDegree',
            distribution: { distribution: 'normal', mean: -1, sd: 2 },
          },
        }}
        showCount={false}
        showTopology
        interfaceType="Sociogram"
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Mean' }),
    ).not.toHaveAttribute('min');

    rerender(
      <SyntheticField
        value={{
          topology: {
            metric: 'density',
            distribution: { distribution: 'normal', mean: 0.5, sd: 0.1 },
          },
        }}
        showCount={false}
        showTopology
        interfaceType="Sociogram"
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Mean' })).toHaveAttribute(
      'min',
      '0',
    );
  });

  /**
   * A negative mean has to be TYPEABLE, which a number input only allows one
   * keystroke at a time: while the field holds a lone "-" the browser reports
   * its value as the empty string, because "-" is not yet a number. A handler
   * that reads that as zero writes zero back into the controlled value, and
   * React — which rewrites a number input whenever the committed value is 0 and
   * the field looks empty — replaces the minus sign with "0" before the digit
   * can be typed. The negative mean the schema allows is then unreachable
   * through the keyboard.
   */
  it('lets a negative normal count mean be typed one keystroke at a time', () => {
    const emitted: (StageNodeAndEdgeSynthetic | null)[] = [];
    render(
      <ControlledSyntheticField
        initialValue={{ count: { distribution: 'normal', mean: 8, sd: 3 } }}
        onEmit={(next) => emitted.push(next)}
        showCount
        showTopology={false}
        interfaceType="NameGenerator"
      />,
    );

    const mean = screen.getByRole('spinbutton', { name: 'Mean' });
    expect(mean).toHaveValue(8);

    // The author selects the value and presses "-". jsdom applies the same
    // value sanitisation a browser does, so the field reports "".
    fireEvent.change(mean, { target: { value: '-' } });

    // The load-bearing assertion: mid-edit the field is still empty rather than
    // rewritten to "0", so the minus sign the browser is holding survives.
    expect(mean).toHaveValue(null);
    expect(emitted.at(-1)).toEqual({
      count: { distribution: 'normal', mean: undefined, sd: 3 },
    });

    // ...and the digit that follows lands on the surviving minus.
    fireEvent.change(mean, { target: { value: '-2' } });

    expect(mean).toHaveValue(-2);
    expect(emitted.at(-1)).toEqual({
      count: { distribution: 'normal', mean: -2, sd: 3 },
    });
  });

  it('lets a negative normal mean-degree mean be typed one keystroke at a time', () => {
    const emitted: (StageNodeAndEdgeSynthetic | null)[] = [];
    render(
      <ControlledSyntheticField
        initialValue={{
          topology: {
            metric: 'meanDegree',
            distribution: { distribution: 'normal', mean: 3, sd: 1 },
          },
        }}
        onEmit={(next) => emitted.push(next)}
        showCount={false}
        showTopology
        interfaceType="Sociogram"
      />,
    );

    const mean = screen.getByRole('spinbutton', { name: 'Mean' });
    fireEvent.change(mean, { target: { value: '-' } });

    expect(mean).toHaveValue(null);

    fireEvent.change(mean, { target: { value: '-1' } });

    expect(mean).toHaveValue(-1);
    expect(emitted.at(-1)).toEqual({
      topology: {
        metric: 'meanDegree',
        distribution: { distribution: 'normal', mean: -1, sd: 1 },
      },
    });
  });

  /**
   * Emptying a required parameter is not the same edit as typing zero into it,
   * and the section must not conflate them: cleared, it holds nothing and the
   * block's own schema rule refuses the stage until a number is supplied — the
   * behaviour every other numeric field in the editor already has.
   */
  it('clears a required parameter to nothing rather than to zero', () => {
    const emitted: (StageNodeAndEdgeSynthetic | null)[] = [];
    render(
      <ControlledSyntheticField
        initialValue={{ count: { distribution: 'constant', value: 4 } }}
        onEmit={(next) => emitted.push(next)}
        showCount
        showTopology={false}
        interfaceType="NameGenerator"
      />,
    );

    const count = screen.getByRole('spinbutton', { name: 'Count' });
    fireEvent.change(count, { target: { value: '' } });

    expect(count).toHaveValue(null);
    expect(emitted.at(-1)).toEqual({
      count: { distribution: 'constant', value: undefined },
    });
  });
});
