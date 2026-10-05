import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import BinSummary from '../BinSummary';

// Label resolution is `useNodeLabel`'s job and needs the whole session store to
// exercise. What BinSummary owns is how the resolved label and the count of
// everything else are laid out relative to each other.
vi.mock('../../../Anonymisation/useNodeLabel', async () => {
  const { entityAttributesProperty: attributes } =
    await import('@codaco/shared-consts');
  return {
    useNodeLabel: (node?: NcNode) =>
      node?.[attributes]?.name as string | undefined,
  };
});

const LONG_LABEL =
  'Aleksandra Konstantina Kowalczyk-Nowakowska de la Fuente y Villanueva';

const makeNode = (name: string, index: number): NcNode => ({
  [entityPrimaryKeyProperty]: `node-${index}`,
  [entityAttributesProperty]: { name },
  type: 'person',
});

const makeNodes = (count: number, firstLabel = LONG_LABEL) =>
  Array.from({ length: count }, (_, index) =>
    makeNode(index === 0 ? firstLabel : `Person ${index}`, index),
  );

describe('BinSummary', () => {
  it('keeps the count of the remaining nodes outside the label element', () => {
    render(<BinSummary nodes={makeNodes(4)} />);

    // The count is its own element, so clamping the label to a couple of lines
    // cannot take the count with it. Concatenating the two into one string —
    // which is what this replaced — puts the count past the clamp, and the bin
    // then reads as holding a single person.
    const count = screen.getByText('and 3 others');
    expect(count.textContent).toBe('and 3 others');

    const label = screen.getByText(LONG_LABEL);
    expect(label).not.toBe(count);
    expect(label).not.toContainElement(count);
    expect(label.textContent).toBe(LONG_LABEL);
  });

  it('separates the label from the count in the text content', () => {
    render(<BinSummary nodes={makeNodes(4)} />);

    // Both spans are block-level, so the line break between them is layout
    // only — nothing in the text content separates them. A screen reader
    // reading the paragraph would say "Villanuevaand 3 others".
    const paragraph = screen.getByText('and 3 others').closest('p');
    expect(paragraph?.textContent).toBe(`${LONG_LABEL} and 3 others`);
  });

  it('says "other" rather than "others" for a single remaining node', () => {
    render(<BinSummary nodes={makeNodes(2)} />);

    expect(screen.getByText('and 1 other')).toBeInTheDocument();
    expect(screen.queryByText(/others/)).not.toBeInTheDocument();
  });

  it('shows no count when the bin holds one node', () => {
    render(<BinSummary nodes={makeNodes(1)} />);

    expect(screen.getByText(LONG_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(/^and /)).not.toBeInTheDocument();
  });
});
