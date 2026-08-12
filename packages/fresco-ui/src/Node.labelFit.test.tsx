import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installLabelMetrics,
  uninstallLabelMetrics,
} from './__tests__/labelMetrics';
import Node, { labelVariants } from './Node';

const labelOf = (text: string) => screen.getByText(text);

const name = (characters: number) => 'a'.repeat(characters);

beforeEach(installLabelMetrics);
afterEach(uninstallLabelMetrics);

// Under the simulated metrics a line holds 11 characters at `md`'s default
// rung, 13 at `text-sm` and 15 at `text-xs`.
describe('Node label fitting', () => {
  it('leaves a label that already fits exactly as it was', async () => {
    render(<Node label="Ash" />);

    await waitFor(() =>
      expect(labelOf('Ash')).toHaveAttribute(
        'class',
        labelVariants({ size: 'md' }),
      ),
    );
  });

  it('keeps a common name whole instead of breaking it mid-word', async () => {
    render(<Node label="Mohammad Crist" />);

    // "Mohammad" fits a default line whole, so no rung with word-breaking is
    // ever reached — the regression this guards is the base style itself
    // allowing an emergency break ("Mohamma / d") the ladder cannot see.
    await waitFor(() =>
      expect(labelOf('Mohammad Crist')).toHaveAttribute(
        'class',
        labelVariants({ size: 'md' }),
      ),
    );
    expect(labelOf('Mohammad Crist')).not.toHaveClass('wrap-anywhere');
    expect(labelOf('Mohammad Crist')).not.toHaveClass('hyphens-auto');
  });

  it('steps the type down until the longest word fits whole', async () => {
    // Twelve characters overflow an 11-character default line but fit a
    // 13-character `text-sm` line without breaking.
    render(<Node label="Christophers Wisozk" />);

    const label = labelOf('Christophers Wisozk');
    await waitFor(() => expect(label).toHaveClass('text-sm', 'line-clamp-3'));
    expect(label).not.toHaveClass('hyphens-auto');
    expect(label).not.toHaveClass('wrap-anywhere');
  });

  it('trades type size for line count when a name has many words', async () => {
    // Every word fits a line whole, but four lines only exist at the floor.
    render(<Node label="Alessandro Maximilian Sebastian Valentina" />);

    const label = labelOf('Alessandro Maximilian Sebastian Valentina');
    await waitFor(() => expect(label).toHaveClass('text-xs', 'line-clamp-4'));
    expect(label).not.toHaveClass('hyphens-auto');
    expect(label).not.toHaveClass('wrap-anywhere');
  });

  it('breaks at a hyphenation point when no size fits the word whole', async () => {
    // Seventeen characters overflow even a floor line; the word is in the
    // simulated hyphenation dictionary, so the hyphenating rung fits it.
    render(<Node label="Konstantinopoulos" />);

    const label = labelOf('Konstantinopoulos');
    await waitFor(() => expect(label).toHaveClass('hyphens-auto'));
    expect(label).toHaveClass('text-xs', 'line-clamp-4');
    expect(label).not.toHaveClass('wrap-anywhere');
  });

  it('breaks anywhere only for a word hyphenation cannot segment', async () => {
    render(<Node label={name(30)} />);

    await waitFor(() => expect(labelOf(name(30))).toHaveClass('wrap-anywhere'));
  });

  it('never shrinks past the legibility floor', async () => {
    render(<Node label={name(400)} />);

    await waitFor(() =>
      expect(labelOf(name(400))).toHaveClass(
        'text-xs',
        'line-clamp-4',
        'wrap-anywhere',
      ),
    );
  });

  it('fits against the node it is rendered in, not a fixed budget', async () => {
    // The same name that lands on `md`'s middle rung has to walk `lg`'s
    // ladder all the way to its floor, because `lg`'s lines start wider but
    // its floor is a size larger.
    render(<Node label="Christophers Wisozk" size="lg" />);

    const label = labelOf('Christophers Wisozk');
    await waitFor(() => expect(label).toHaveClass('text-sm', 'line-clamp-4'));
    expect(label).not.toHaveClass('hyphens-auto');
  });

  it.each(['xxs', 'xs'] as const)(
    'concedes straight to breaking on %s, which has no smaller rungs',
    async (size) => {
      render(<Node label={name(200)} size={size} />);

      await waitFor(() =>
        expect(labelOf(name(200))).toHaveClass('wrap-anywhere'),
      );
    },
  );
});
