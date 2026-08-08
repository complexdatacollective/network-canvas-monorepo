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

  it('steps the type down rather than clipping a slightly long name', async () => {
    render(<Node label={name(36)} />);

    await waitFor(() =>
      expect(labelOf(name(36))).toHaveClass('text-sm', 'line-clamp-3'),
    );
  });

  it('reaches the smallest rung for a name that needs it', async () => {
    render(<Node label={name(55)} />);

    await waitFor(() =>
      expect(labelOf(name(55))).toHaveClass('text-xs', 'line-clamp-4'),
    );
  });

  it('never shrinks past the legibility floor', async () => {
    render(<Node label={name(400)} />);

    await waitFor(() =>
      expect(labelOf(name(400))).toHaveClass('text-xs', 'line-clamp-4'),
    );
  });

  it('fits against the node it is rendered in, not a fixed budget', async () => {
    render(<Node label={name(30)} size="lg" />);

    // 30 characters overflow `lg`'s default type but fit the next rung down,
    // where the same name would not have moved the `md` ladder at all.
    await waitFor(() =>
      expect(labelOf(name(30))).toHaveClass('text-base', 'line-clamp-3'),
    );
  });

  it.each(['xxs', 'xs'] as const)(
    'leaves %s alone, already being at the floor',
    async (size) => {
      render(<Node label={name(200)} size={size} />);

      await waitFor(() =>
        expect(labelOf(name(200))).toHaveAttribute(
          'class',
          labelVariants({ size }),
        ),
      );
    },
  );
});
